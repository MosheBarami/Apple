/**
 * Curriculum D: first-party, engine-independent game-logic seeds.
 *
 * Same contract as the other curricula in this directory: every answer is a pure Luau function
 * with bounded inputs, so `verifyExample` can execute the real behaviour locally and prove that
 * one semantic mutation is rejected by the example's own assertions. Nothing here touches a
 * Roblox service, a DataStore, a RemoteEvent or a clock.
 */

const finiteNumber = `local function finite(value)
    return type(value) == "number" and value == value and math.abs(value) < math.huge
end
`;

const safeInteger = `local function integer(value)
    return type(value) == "number" and value == value and math.abs(value) < math.huge and value % 1 == 0 and math.abs(value) <= 9007199254740991
end
`;

const plainArray = `local function array(value)
    if type(value) ~= "table" or getmetatable(value) ~= nil then return false end
    local length = #value
    for key in pairs(value) do
        if type(key) ~= "number" or key % 1 ~= 0 or key < 1 or key > length then return false end
    end
    for i = 1, length do
        if value[i] == nil then return false end
    end
    return true
end
`;

export const GAME_LOGIC_CURRICULUM_D = [
  {
    id: 'radial-damage-falloff', family: 'damage-falloff',
    prompt: 'Write a standalone Luau module returning falloff(power, distance, innerRadius, outerRadius). All four arguments must be finite numbers, power, distance and innerRadius nonnegative, and outerRadius strictly greater than innerRadius; anything else returns nil. Inside innerRadius return the full power, at or beyond outerRadius return 0, and between them interpolate linearly on power * (outerRadius - distance) / (outerRadius - innerRadius). This is pure blast arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(power, distance, innerRadius, outerRadius)
    if not finite(power) or not finite(distance) or not finite(innerRadius) or not finite(outerRadius) then return nil end
    if power < 0 or distance < 0 or innerRadius < 0 or outerRadius <= innerRadius then return nil end
    if distance <= innerRadius then return power end
    if distance >= outerRadius then return 0 end
    return power * (outerRadius - distance) / (outerRadius - innerRadius)
end`,
    checks: `assert(candidate(100, 0, 10, 20) == 100)
assert(candidate(100, 10, 10, 20) == 100)
assert(candidate(100, 12.5, 10, 20) == 75)
assert(candidate(100, 15, 10, 20) == 50)
assert(candidate(100, 20, 10, 20) == 0)
assert(candidate(100, 25, 10, 20) == 0)
assert(candidate(0, 5, 10, 20) == 0)
assert(candidate(60, 5, 0, 10) == 30)
local previous = 81
for step = 0, 100 do
    local distance = step / 4
    local value = candidate(80, distance, 10, 20)
    assert(value >= 0 and value <= 80)
    assert(value <= previous + 1e-9)
    previous = value
end
assert(candidate(100, 5, 20, 20) == nil)
assert(candidate(100, 5, 20, 10) == nil)
assert(candidate(-1, 5, 10, 20) == nil)
assert(candidate(100, -1, 10, 20) == nil)
assert(candidate(100, 5, -1, 20) == nil)
assert(candidate(0/0, 5, 10, 20) == nil)
assert(candidate(100, math.huge, 10, 20) == nil)
assert(candidate(100, 5, 10, 0/0) == nil)
assert(candidate("100", 5, 10, 20) == nil)`,
    mutation: ['(outerRadius - distance) / (outerRadius - innerRadius)', '(outerRadius - distance) / outerRadius'],
  },
  {
    id: 'due-respawns', family: 'respawn-queue',
    prompt: 'Write a standalone Luau module returning due(queue, now). queue must be a plain array of plain records {userId = nonempty string, readyAt = finite number} with unique userIds, and now must be a finite number; anything else returns nil. Return two fresh arrays: the userIds whose readyAt is at or before now ordered by ascending readyAt then ascending userId, and fresh copies of the still-waiting records in their original order. The input queue and its records must not change. This is pure queue arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + plainArray + `return function(queue, now)
    if not array(queue) or not finite(now) then return nil end
    local ready = {}
    local waiting = {}
    local seen = {}
    for i = 1, #queue do
        local entry = queue[i]
        if type(entry) ~= "table" or getmetatable(entry) ~= nil then return nil end
        local userId = entry.userId
        local readyAt = entry.readyAt
        if type(userId) ~= "string" or userId == "" or seen[userId] or not finite(readyAt) then return nil end
        seen[userId] = true
        if readyAt <= now then
            table.insert(ready, {userId = userId, readyAt = readyAt})
        else
            table.insert(waiting, {userId = userId, readyAt = readyAt})
        end
    end
    table.sort(ready, function(a, b)
        if a.readyAt == b.readyAt then return a.userId < b.userId end
        return a.readyAt < b.readyAt
    end)
    local released = {}
    for i = 1, #ready do
        released[i] = ready[i].userId
    end
    return released, waiting
end`,
    checks: `local queue = {{userId = "c", readyAt = 5}, {userId = "a", readyAt = 2}, {userId = "b", readyAt = 2}, {userId = "d", readyAt = 9}}
local released, waiting = candidate(queue, 5)
assert(table.concat(released, ",") == "a,b,c")
assert(#waiting == 1 and waiting[1].userId == "d" and waiting[1].readyAt == 9)
assert(waiting[1] ~= queue[4] and queue[1].userId == "c" and #queue == 4)
local none, still = candidate(queue, 1)
assert(#none == 0 and #still == 4 and still[1].userId == "c")
local all = candidate(queue, 9)
assert(table.concat(all, ",") == "a,b,c,d")
local empty, rest = candidate({}, 0)
assert(#empty == 0 and #rest == 0)
assert(candidate(queue, 0/0) == nil)
assert(candidate(queue, math.huge) == nil)
assert(candidate(queue, "5") == nil)
assert(candidate({{userId = "a", readyAt = 1}, {userId = "a", readyAt = 2}}, 5) == nil)
assert(candidate({{userId = "", readyAt = 1}}, 5) == nil)
assert(candidate({{userId = "a", readyAt = "1"}}, 5) == nil)
assert(candidate({{userId = "a", readyAt = math.huge}}, 5) == nil)
assert(candidate({"a"}, 5) == nil)
assert(candidate(nil, 5) == nil)
assert(candidate({[1] = {userId = "a", readyAt = 1}, [3] = {userId = "b", readyAt = 1}}, 5) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, 5) == nil)
assert(candidate({protected}, 5) == nil)`,
    mutation: ['if readyAt <= now then', 'if readyAt < now then'],
  },
  {
    id: 'rating-bracket', family: 'matchmaking-brackets',
    prompt: 'Write a standalone Luau module returning bracket(rating, floorRating, width, count). rating and floorRating must be finite numbers, width a finite positive number, and count a finite positive safe integer; anything else returns nil. A rating at or below floorRating is bracket 1, otherwise the bracket is math.floor((rating - floorRating) / width) + 1 clamped upward to count. This is pure bracket arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + finiteNumber + `return function(rating, floorRating, width, count)
    if not finite(rating) or not finite(floorRating) or not finite(width) or not integer(count) then return nil end
    if width <= 0 or count < 1 then return nil end
    if rating <= floorRating then return 1 end
    local index = math.floor((rating - floorRating) / width) + 1
    return math.min(index, count)
end`,
    checks: `for count = 1, 6 do
    for rating = -3, 20 do
        local expected = 1
        if rating > 0 then expected = math.min(math.floor(rating / 4) + 1, count) end
        assert(candidate(rating, 0, 4, count) == expected)
    end
end
assert(candidate(3.999, 0, 4, 3) == 1)
assert(candidate(4, 0, 4, 3) == 2)
assert(candidate(100, 0, 25, 4) == 4)
assert(candidate(-5, -10, 5, 3) == 2)
assert(candidate(1e300, 0, 1e-300, 3) == 3)
assert(candidate(1, 0, 0, 3) == nil)
assert(candidate(1, 0, -4, 3) == nil)
assert(candidate(1, 0, 4, 0) == nil)
assert(candidate(1, 0, 4, 1.5) == nil)
assert(candidate(0/0, 0, 4, 3) == nil)
assert(candidate(math.huge, 0, 4, 3) == nil)
assert(candidate(1, 0/0, 4, 3) == nil)
assert(candidate(1, 0, math.huge, 3) == nil)
assert(candidate(1, 0, 4, math.huge) == nil)
assert(candidate("1", 0, 4, 3) == nil)`,
    mutation: ['math.floor((rating - floorRating) / width) + 1', 'math.floor((rating - floorRating) / width)'],
  },
  {
    id: 'loot-budget', family: 'loot-budget-allocation',
    prompt: 'Write a standalone Luau module returning allocate(entries, budget). entries must be a plain array of plain records {id = nonempty unique string, cost = positive safe integer, maximum = positive safe integer} and budget a finite nonnegative safe integer; anything else returns nil. Walk the entries in order taking as many of each as the remaining budget allows up to its maximum, and return a fresh array of {id, count} records for the entries with a nonzero count plus the unspent budget. The input must not change. This is pure allocation arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + plainArray + `return function(entries, budget)
    if not array(entries) or not integer(budget) or budget < 0 then return nil end
    local seen = {}
    local picked = {}
    local remaining = budget
    for i = 1, #entries do
        local entry = entries[i]
        if type(entry) ~= "table" or getmetatable(entry) ~= nil then return nil end
        local id = entry.id
        local cost = entry.cost
        local maximum = entry.maximum
        if type(id) ~= "string" or id == "" or seen[id] then return nil end
        if not integer(cost) or cost <= 0 or not integer(maximum) or maximum <= 0 then return nil end
        seen[id] = true
        local count = math.min(maximum, math.floor(remaining / cost))
        if count > 0 then
            remaining -= count * cost
            table.insert(picked, {id = id, count = count})
        end
    end
    return picked, remaining
end`,
    checks: `local entries = {{id = "sword", cost = 30, maximum = 2}, {id = "potion", cost = 7, maximum = 10}, {id = "gem", cost = 100, maximum = 1}}
local picked, remaining = candidate(entries, 100)
assert(#picked == 2)
assert(picked[1].id == "sword" and picked[1].count == 2)
assert(picked[2].id == "potion" and picked[2].count == 5)
assert(remaining == 5)
assert(entries[1].count == nil and #entries == 3)
for budget = 0, 130 do
    local rows, left = candidate(entries, budget)
    local spent = 0
    for _, row in ipairs(rows) do
        assert(row.count >= 1)
        local cost = 100
        if row.id == "sword" then cost = 30 elseif row.id == "potion" then cost = 7 end
        spent += row.count * cost
    end
    assert(left >= 0 and spent + left == budget)
end
local none, all = candidate(entries, 0)
assert(#none == 0 and all == 0)
local empty, keep = candidate({}, 9)
assert(#empty == 0 and keep == 9)
assert(candidate(entries, -1) == nil)
assert(candidate(entries, 1.5) == nil)
assert(candidate(entries, 0/0) == nil)
assert(candidate(entries, math.huge) == nil)
assert(candidate({{id = "a", cost = 0, maximum = 1}}, 5) == nil)
assert(candidate({{id = "a", cost = 1, maximum = 0}}, 5) == nil)
assert(candidate({{id = "a", cost = 1.5, maximum = 1}}, 5) == nil)
assert(candidate({{id = "a", cost = 1, maximum = 1}, {id = "a", cost = 1, maximum = 1}}, 5) == nil)
assert(candidate({{id = "", cost = 1, maximum = 1}}, 5) == nil)
assert(candidate({"a"}, 5) == nil)
assert(candidate(nil, 5) == nil)
assert(candidate({[1] = {id = "a", cost = 1, maximum = 1}, [3] = {id = "b", cost = 1, maximum = 1}}, 5) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, 5) == nil)
assert(candidate({protected}, 5) == nil)`,
    mutation: ['math.min(maximum, math.floor(remaining / cost))', 'math.floor(remaining / cost)'],
  },
  {
    id: 'stamina-regen', family: 'stamina-regeneration',
    prompt: 'Write a standalone Luau module returning regenerate(current, maximum, idle, rate, delay). All five arguments must be finite numbers with maximum positive, current in [0, maximum], idle nonnegative, rate positive and delay nonnegative; anything else returns nil. Only the idle time beyond delay regenerates, at rate per second, and the result is capped at maximum; a non-finite intermediate saturates to maximum. This is pure stamina arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(current, maximum, idle, rate, delay)
    if not finite(current) or not finite(maximum) or not finite(idle) or not finite(rate) or not finite(delay) then return nil end
    if current < 0 or maximum <= 0 or current > maximum or idle < 0 or rate <= 0 or delay < 0 then return nil end
    local active = idle - delay
    if active <= 0 then return current end
    local restored = current + active * rate
    if not finite(restored) then return maximum end
    return math.min(restored, maximum)
end`,
    checks: `assert(candidate(50, 100, 0, 10, 2) == 50)
assert(candidate(50, 100, 2, 10, 2) == 50)
assert(candidate(50, 100, 3, 10, 2) == 60)
assert(candidate(50, 100, 7, 10, 2) == 100)
assert(candidate(50, 100, 100, 10, 2) == 100)
assert(candidate(0, 100, 1, 10, 0) == 10)
assert(candidate(100, 100, 100, 10, 0) == 100)
assert(candidate(50, 100, 1e300, 1e300, 0) == 100)
local previous = 24
for step = 0, 60 do
    local idle = step / 4
    local value = candidate(25, 100, idle, 8, 1.5)
    assert(value >= 25 and value <= 100)
    assert(value >= previous - 1e-9)
    previous = value
end
assert(candidate(101, 100, 1, 1, 0) == nil)
assert(candidate(-1, 100, 1, 1, 0) == nil)
assert(candidate(1, 0, 1, 1, 0) == nil)
assert(candidate(1, 100, -1, 1, 0) == nil)
assert(candidate(1, 100, 1, 0, 0) == nil)
assert(candidate(1, 100, 1, 1, -1) == nil)
assert(candidate(0/0, 100, 1, 1, 0) == nil)
assert(candidate(1, math.huge, 1, 1, 0) == nil)
assert(candidate(1, 100, math.huge, 1, 0) == nil)
assert(candidate("1", 100, 1, 1, 0) == nil)`,
    mutation: ['local active = idle - delay', 'local active = idle'],
  },
  {
    id: 'hunger-drain', family: 'hunger-decay',
    prompt: 'Write a standalone Luau module returning decay(level, rate, elapsed). All three arguments must be finite numbers with level nonnegative, rate positive and elapsed nonnegative; anything else returns nil. Return two values: the level remaining after draining rate per second for elapsed seconds, floored at zero, and the number of seconds spent at zero during that interval. A non-finite drain empties the level for the whole interval. This is pure survival arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(level, rate, elapsed)
    if not finite(level) or not finite(rate) or not finite(elapsed) then return nil end
    if level < 0 or rate <= 0 or elapsed < 0 then return nil end
    local drain = rate * elapsed
    if not finite(drain) then return 0, elapsed end
    if drain < level then return level - drain, 0 end
    local emptyAt = level / rate
    return 0, elapsed - emptyAt
end`,
    checks: `local left, starving = candidate(100, 2, 10)
assert(left == 80 and starving == 0)
local left2, starving2 = candidate(10, 2, 10)
assert(left2 == 0 and starving2 == 5)
local left3, starving3 = candidate(10, 2, 5)
assert(left3 == 0 and starving3 == 0)
local left4, starving4 = candidate(0, 2, 4)
assert(left4 == 0 and starving4 == 4)
local left5, starving5 = candidate(100, 2, 0)
assert(left5 == 100 and starving5 == 0)
local left6, starving6 = candidate(1, 1e300, 1e300)
assert(left6 == 0 and starving6 == 1e300)
for step = 0, 30 do
    local elapsed = step / 2
    local remaining, hungry = candidate(6, 2, elapsed)
    assert(remaining >= 0 and hungry >= 0)
    assert(remaining == 0 or hungry == 0)
    assert(math.abs((6 - remaining) - 2 * (elapsed - hungry)) < 1e-9)
end
assert(candidate(-1, 1, 1) == nil)
assert(candidate(1, 0, 1) == nil)
assert(candidate(1, -1, 1) == nil)
assert(candidate(1, 1, -1) == nil)
assert(candidate(0/0, 1, 1) == nil)
assert(candidate(1, math.huge, 1) == nil)
assert(candidate(1, 1, math.huge) == nil)
assert(candidate("1", 1, 1) == nil)`,
    mutation: ['local emptyAt = level / rate', 'local emptyAt = level * rate'],
  },
  {
    id: 'prestige-conversion', family: 'prestige-reset',
    prompt: 'Write a standalone Luau module returning prestige(level, requirement, prestigeCount, maximum). All four arguments must be finite safe integers with level nonnegative, requirement positive, prestigeCount nonnegative and no greater than maximum, and maximum positive; anything else returns nil. Return the level, the prestige count and a boolean: refuse unchanged when the count is already at maximum or the level is below the requirement, otherwise spend the requirement in levels and add one prestige. This is pure progression arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `return function(level, requirement, prestigeCount, maximum)
    if not integer(level) or not integer(requirement) or not integer(prestigeCount) or not integer(maximum) then return nil end
    if level < 0 or requirement <= 0 or prestigeCount < 0 or maximum <= 0 or prestigeCount > maximum then return nil end
    if prestigeCount >= maximum or level < requirement then return level, prestigeCount, false end
    return level - requirement, prestigeCount + 1, true
end`,
    checks: `for maximum = 1, 4 do
    for prestigeCount = 0, maximum do
        for level = 0, 12 do
            local newLevel, newPrestige, ok = candidate(level, 5, prestigeCount, maximum)
            local expected = prestigeCount < maximum and level >= 5
            assert(ok == expected)
            assert(newLevel == (if expected then level - 5 else level))
            assert(newPrestige == (if expected then prestigeCount + 1 else prestigeCount))
        end
    end
end
local l, p, ok = candidate(5, 5, 0, 1)
assert(l == 0 and p == 1 and ok == true)
local l2, p2, ok2 = candidate(5, 5, 1, 1)
assert(l2 == 5 and p2 == 1 and ok2 == false)
assert(candidate(5, 0, 0, 1) == nil)
assert(candidate(5, 5, 2, 1) == nil)
assert(candidate(-1, 5, 0, 1) == nil)
assert(candidate(5, 5, -1, 1) == nil)
assert(candidate(5, 5, 0, 0) == nil)
assert(candidate(5.5, 5, 0, 1) == nil)
assert(candidate(0/0, 5, 0, 1) == nil)
assert(candidate(math.huge, 5, 0, 1) == nil)
assert(candidate("5", 5, 0, 1) == nil)`,
    mutation: ['if prestigeCount >= maximum or level < requirement then', 'if level < requirement then'],
  },
  {
    id: 'quest-step', family: 'quest-step-gating',
    prompt: 'Write a standalone Luau module returning currentStep(requirements, progress). requirements must be a plain nonempty array of positive safe integers and progress a plain array of the same length holding safe integers in [0, requirement] for each index; anything else returns nil. Steps are strictly ordered, so any progress recorded on a step after the first incomplete one is inconsistent and returns nil. Return the 1-based index of the first incomplete step and the amount still needed for it, or the length plus one and zero when every step is complete. This is pure quest bookkeeping, not a RemoteEvent handler or persistent save.',
    source: safeInteger + plainArray + `return function(requirements, progress)
    if not array(requirements) or not array(progress) then return nil end
    if #requirements == 0 or #requirements ~= #progress then return nil end
    local current = #requirements + 1
    for i = 1, #requirements do
        local need = requirements[i]
        local done = progress[i]
        if not integer(need) or need <= 0 or not integer(done) or done < 0 or done > need then return nil end
        if current <= #requirements and done > 0 then return nil end
        if done < need and current > #requirements then current = i end
    end
    if current > #requirements then return current, 0 end
    return current, requirements[current] - progress[current]
end`,
    checks: `local requirements = {3, 2, 4}
local step, remaining = candidate(requirements, {3, 2, 4})
assert(step == 4 and remaining == 0)
local step2, remaining2 = candidate(requirements, {3, 1, 0})
assert(step2 == 2 and remaining2 == 1)
local step3, remaining3 = candidate(requirements, {0, 0, 0})
assert(step3 == 1 and remaining3 == 3)
local step4, remaining4 = candidate(requirements, {3, 2, 0})
assert(step4 == 3 and remaining4 == 4)
local pair = {2, 2}
for a = 0, 2 do
    for b = 0, 2 do
        local expectedStep, expectedRemaining = nil, nil
        if a < 2 then
            if b == 0 then expectedStep, expectedRemaining = 1, 2 - a end
        elseif b < 2 then
            expectedStep, expectedRemaining = 2, 2 - b
        else
            expectedStep, expectedRemaining = 3, 0
        end
        local got, left = candidate(pair, {a, b})
        assert(got == expectedStep)
        if expectedStep ~= nil then assert(left == expectedRemaining) end
    end
end
assert(candidate(requirements, {0, 1, 0}) == nil)
assert(candidate(requirements, {3, 0, 1}) == nil)
assert(candidate(requirements, {4, 0, 0}) == nil)
assert(candidate(requirements, {-1, 0, 0}) == nil)
assert(candidate(requirements, {3, 2}) == nil)
assert(candidate({}, {}) == nil)
assert(candidate({0}, {0}) == nil)
assert(candidate({1.5}, {0}) == nil)
assert(candidate({1}, {0.5}) == nil)
assert(candidate({1}, {0/0}) == nil)
assert(candidate({math.huge}, {0}) == nil)
assert(candidate({"1"}, {0}) == nil)
assert(candidate(nil, {1}) == nil)
assert(candidate({[1] = 1, [3] = 1}, {0, 0, 0}) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, {}) == nil)`,
    mutation: ['if done < need and current > #requirements then current = i end', 'if done <= need and current > #requirements then current = i end'],
  },
  {
    id: 'ability-charges', family: 'ability-charges',
    prompt: 'Write a standalone Luau module returning recharge(stored, maximum, elapsed, rechargeTime). stored and maximum must be finite safe integers with stored in [0, maximum] and maximum positive, elapsed a finite nonnegative number, and rechargeTime a finite positive number; anything else returns nil. Return the new charge count and the elapsed time carried into the next charge, which is zero whenever the count reaches maximum. This is pure charge arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + finiteNumber + `return function(stored, maximum, elapsed, rechargeTime)
    if not integer(stored) or not integer(maximum) or not finite(elapsed) or not finite(rechargeTime) then return nil end
    if stored < 0 or maximum <= 0 or stored > maximum or elapsed < 0 or rechargeTime <= 0 then return nil end
    if stored == maximum then return maximum, 0 end
    local gained = math.floor(elapsed / rechargeTime)
    local missing = maximum - stored
    if gained >= missing then return maximum, 0 end
    return stored + gained, elapsed - gained * rechargeTime
end`,
    checks: `local count, carry = candidate(0, 3, 0, 5)
assert(count == 0 and carry == 0)
local count2, carry2 = candidate(0, 3, 12, 5)
assert(count2 == 2 and carry2 == 2)
local count3, carry3 = candidate(0, 3, 15, 5)
assert(count3 == 3 and carry3 == 0)
local count4, carry4 = candidate(0, 3, 100, 5)
assert(count4 == 3 and carry4 == 0)
local count5, carry5 = candidate(3, 3, 100, 5)
assert(count5 == 3 and carry5 == 0)
local count6, carry6 = candidate(1, 3, 4.5, 5)
assert(count6 == 1 and carry6 == 4.5)
for stored = 0, 4 do
    for elapsed = 0, 24 do
        local got, rest = candidate(stored, 4, elapsed, 5)
        assert(got == math.min(4, stored + math.floor(elapsed / 5)))
        assert(rest >= 0 and rest < 5)
        assert((got == 4 and rest == 0) or rest == elapsed - (got - stored) * 5)
    end
end
assert(candidate(4, 3, 1, 5) == nil)
assert(candidate(-1, 3, 1, 5) == nil)
assert(candidate(0, 0, 1, 5) == nil)
assert(candidate(0, 3, -1, 5) == nil)
assert(candidate(0, 3, 1, 0) == nil)
assert(candidate(0.5, 3, 1, 5) == nil)
assert(candidate(0, 3, 0/0, 5) == nil)
assert(candidate(0, 3, math.huge, 5) == nil)
assert(candidate(0, 3, 1, math.huge) == nil)
assert(candidate("0", 3, 1, 5) == nil)`,
    mutation: ['return stored + gained, elapsed - gained * rechargeTime', 'return stored + gained, elapsed'],
  },
  {
    id: 'projectile-lead', family: 'projectile-intercept',
    prompt: 'Write a standalone Luau module returning intercept(dx, dy, vx, vy, speed). All five arguments must be finite numbers and speed positive; anything else returns nil. The target sits at offset (dx, dy) moving at constant velocity (vx, vy) and the projectile leaves the origin at the given speed, so solve for the smallest strictly positive time t where the target distance equals speed * t, treating an offset of zero as t = 0. Return that time, or nil when no positive solution exists. This is pure lead arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(dx, dy, vx, vy, speed)
    if not finite(dx) or not finite(dy) or not finite(vx) or not finite(vy) or not finite(speed) then return nil end
    if speed <= 0 then return nil end
    local a = vx * vx + vy * vy - speed * speed
    local b = 2 * (dx * vx + dy * vy)
    local c = dx * dx + dy * dy
    if not finite(a) or not finite(b) or not finite(c) then return nil end
    if c == 0 then return 0 end
    if math.abs(a) < 1e-9 then
        if b >= 0 then return nil end
        return -c / b
    end
    local discriminant = b * b - 4 * a * c
    if not finite(discriminant) or discriminant < 0 then return nil end
    local root = math.sqrt(discriminant)
    local first = (-b - root) / (2 * a)
    local second = (-b + root) / (2 * a)
    if first > second then
        first, second = second, first
    end
    if first > 0 then return first end
    if second > 0 then return second end
    return nil
end`,
    checks: `local function hits(dx, dy, vx, vy, speed)
    local t = candidate(dx, dy, vx, vy, speed)
    assert(t ~= nil)
    assert(t > 0)
    local px = dx + vx * t
    local py = dy + vy * t
    assert(math.abs(math.sqrt(px * px + py * py) - speed * t) < 1e-6)
    return t
end
assert(math.abs(hits(100, 0, 0, 0, 50) - 2) < 1e-9)
assert(math.abs(hits(100, 0, -10, 0, 50) - (100 / 60)) < 1e-9)
assert(math.abs(hits(100, 0, 10, 0, 50) - 2.5) < 1e-9)
hits(30, 40, -5, 12, 60)
hits(-20, 15, 3, -7, 25)
hits(0, 75, 9, 0, 40)
assert(math.abs(candidate(100, 0, -50, 0, 50) - 1) < 1e-9)
assert(candidate(100, 0, 50, 0, 50) == nil)
assert(candidate(100, 0, 60, 0, 50) == nil)
assert(candidate(0, 0, 10, 0, 50) == 0)
assert(candidate(1, 0, 0, 0, 0) == nil)
assert(candidate(1, 0, 0, 0, -5) == nil)
assert(candidate(0/0, 0, 0, 0, 5) == nil)
assert(candidate(1, 0/0, 0, 0, 5) == nil)
assert(candidate(math.huge, 0, 0, 0, 5) == nil)
assert(candidate(1, 0, math.huge, 0, 5) == nil)
assert(candidate("1", 0, 0, 0, 5) == nil)`,
    mutation: ['local b = 2 * (dx * vx + dy * vy)', 'local b = 2 * (dx * vx - dy * vy)'],
  },
  {
    id: 'grid-snap', family: 'grid-snapping',
    prompt: 'Write a standalone Luau module returning snap(x, z, origin, size). All four arguments must be finite numbers and size positive; anything else returns nil, as does a non-finite snapped coordinate. Snap each axis to the nearest grid node with origin + math.floor((axis - origin) / size + 0.5) * size, so a value exactly halfway rounds upward. Return the two snapped coordinates. This is pure placement arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(x, z, origin, size)
    if not finite(x) or not finite(z) or not finite(origin) or not finite(size) or size <= 0 then return nil end
    local snappedX = origin + math.floor((x - origin) / size + 0.5) * size
    local snappedZ = origin + math.floor((z - origin) / size + 0.5) * size
    if not finite(snappedX) or not finite(snappedZ) then return nil end
    return snappedX, snappedZ
end`,
    checks: `local x1, z1 = candidate(0, 0, 0, 4)
assert(x1 == 0 and z1 == 0)
local x2, z2 = candidate(2, -2, 0, 4)
assert(x2 == 4 and z2 == 0)
local x3, z3 = candidate(1.99, -2.1, 0, 4)
assert(x3 == 0 and z3 == -4)
local x4, z4 = candidate(6, 10, 0, 4)
assert(x4 == 8 and z4 == 12)
local x5, z5 = candidate(7, 7, 1, 4)
assert(x5 == 9 and z5 == 9)
for step = -60, 60 do
    local value = step / 4
    local sx, sz = candidate(value, value, 0, 3)
    assert(sx == sz)
    assert(sx % 3 == 0)
    assert(math.abs(sx - value) <= 1.5 + 1e-9)
end
assert(candidate(1, 1, 0, 0) == nil)
assert(candidate(1, 1, 0, -4) == nil)
assert(candidate(0/0, 1, 0, 4) == nil)
assert(candidate(1, 0/0, 0, 4) == nil)
assert(candidate(1, math.huge, 0, 4) == nil)
assert(candidate(1, 1, 0/0, 4) == nil)
assert(candidate(1, 1, 0, math.huge) == nil)
assert(candidate(1e308, 1, 0, 1e-300) == nil)
assert(candidate("1", 1, 0, 4) == nil)`,
    mutation: ['math.floor((x - origin) / size + 0.5) * size', 'math.floor((x - origin) / size) * size'],
  },
  {
    id: 'grid-route-cost', family: 'grid-path-search',
    prompt: 'Write a standalone Luau module returning cheapest(grid, startRow, startColumn, goalRow, goalColumn). grid must be a plain nonempty array of plain equal-length nonempty rows whose cells are either false for blocked or a finite positive entry cost, and the four coordinates must be safe integers inside the grid naming unblocked cells; anything else returns nil. Moving is four-directional and each move pays the entry cost of the cell moved into, so return the minimum total cost from start to goal, zero when they are the same cell, or nil when the goal is unreachable. This is pure grid arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + plainArray + `return function(grid, startRow, startColumn, goalRow, goalColumn)
    if not array(grid) or #grid == 0 then return nil end
    local width = nil
    for r = 1, #grid do
        local row = grid[r]
        if not array(row) or #row == 0 then return nil end
        if width == nil then
            width = #row
        elseif #row ~= width then
            return nil
        end
        for c = 1, width do
            local cell = row[c]
            if cell ~= false and (not finite(cell) or cell <= 0) then return nil end
        end
    end
    local function inside(r, c)
        if type(r) ~= "number" or type(c) ~= "number" or r ~= r or c ~= c then return false end
        if r % 1 ~= 0 or c % 1 ~= 0 then return false end
        return r >= 1 and r <= #grid and c >= 1 and c <= width
    end
    if not inside(startRow, startColumn) or not inside(goalRow, goalColumn) then return nil end
    if grid[startRow][startColumn] == false or grid[goalRow][goalColumn] == false then return nil end
    local best = {}
    local settled = {}
    for r = 1, #grid do
        best[r] = {}
        settled[r] = {}
        for c = 1, width do
            best[r][c] = math.huge
            settled[r][c] = false
        end
    end
    best[startRow][startColumn] = 0
    for _ = 1, #grid * width do
        local pickRow, pickColumn, pickCost = nil, nil, math.huge
        for r = 1, #grid do
            for c = 1, width do
                if not settled[r][c] and best[r][c] < pickCost then
                    pickRow, pickColumn, pickCost = r, c, best[r][c]
                end
            end
        end
        if pickRow == nil then break end
        settled[pickRow][pickColumn] = true
        for _, delta in {{1, 0}, {-1, 0}, {0, 1}, {0, -1}} do
            local r = pickRow + delta[1]
            local c = pickColumn + delta[2]
            if r >= 1 and r <= #grid and c >= 1 and c <= width and grid[r][c] ~= false then
                local reached = pickCost + grid[r][c]
                if reached < best[r][c] then best[r][c] = reached end
            end
        end
    end
    if best[goalRow][goalColumn] == math.huge then return nil end
    return best[goalRow][goalColumn]
end`,
    checks: `local grid = {{1, 1, 1}, {9, 9, 1}, {1, 1, 1}}
assert(candidate(grid, 1, 1, 3, 3) == 4)
assert(candidate(grid, 1, 1, 1, 1) == 0)
assert(candidate(grid, 1, 1, 1, 3) == 2)
assert(grid[2][1] == 9 and #grid == 3)
local flat = {{1, 1, 1}, {1, 1, 1}, {1, 1, 1}}
for r = 1, 3 do
    for c = 1, 3 do
        assert(candidate(flat, 1, 1, r, c) == (r - 1) + (c - 1))
    end
end
local detour = {{1, 50, 1}, {1, 50, 1}, {1, 1, 1}}
assert(candidate(detour, 1, 1, 1, 3) == 6)
local walled = {{1, false, 1}, {1, false, 1}, {1, false, 1}}
assert(candidate(walled, 1, 1, 1, 3) == nil)
assert(candidate(walled, 1, 1, 3, 1) == 2)
local openWall = {{1, false, 1}, {1, 1, 1}, {1, false, 1}}
assert(candidate(openWall, 1, 1, 1, 3) == 4)
assert(candidate(walled, 1, 2, 1, 1) == nil)
assert(candidate(walled, 1, 1, 1, 2) == nil)
assert(candidate(grid, 0, 1, 3, 3) == nil)
assert(candidate(grid, 1, 1, 4, 3) == nil)
assert(candidate(grid, 1.5, 1, 3, 3) == nil)
assert(candidate(grid, 0/0, 1, 3, 3) == nil)
assert(candidate(grid, "1", 1, 3, 3) == nil)
assert(candidate({{1, 1}, {1}}, 1, 1, 1, 2) == nil)
assert(candidate({{0}}, 1, 1, 1, 1) == nil)
assert(candidate({{-1}}, 1, 1, 1, 1) == nil)
assert(candidate({{math.huge}}, 1, 1, 1, 1) == nil)
assert(candidate({{"1"}}, 1, 1, 1, 1) == nil)
assert(candidate({{}}, 1, 1, 1, 1) == nil)
assert(candidate({}, 1, 1, 1, 1) == nil)
assert(candidate(nil, 1, 1, 1, 1) == nil)
assert(candidate({[1] = {1}, [3] = {1}}, 1, 1, 1, 1) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, 1, 1, 1, 1) == nil)
assert(candidate({protected}, 1, 1, 1, 1) == nil)`,
    mutation: ['local reached = pickCost + grid[r][c]', 'local reached = pickCost + 1'],
  },
  {
    id: 'stack-into-slots', family: 'inventory-stacking',
    prompt: 'Write a standalone Luau module returning store(existing, incoming, maxStack, slots). existing must be a plain array of safe integers in [1, maxStack], incoming a finite nonnegative safe integer, and maxStack and slots finite positive safe integers with slots no smaller than the existing stack count; anything else returns nil. Top up the existing stacks in order first, then open new stacks while free slots remain, and return a fresh array of the resulting stack counts plus the amount that did not fit. The input array must not change. This is pure inventory arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + plainArray + `return function(existing, incoming, maxStack, slots)
    if not array(existing) or not integer(incoming) or not integer(maxStack) or not integer(slots) then return nil end
    if incoming < 0 or maxStack <= 0 or slots <= 0 or #existing > slots then return nil end
    local stacks = {}
    for i = 1, #existing do
        local count = existing[i]
        if not integer(count) or count < 1 or count > maxStack then return nil end
        stacks[i] = count
    end
    local left = incoming
    for i = 1, #stacks do
        if left == 0 then break end
        local room = maxStack - stacks[i]
        local moved = math.min(room, left)
        stacks[i] += moved
        left -= moved
    end
    while left > 0 and #stacks < slots do
        local opened = math.min(maxStack, left)
        table.insert(stacks, opened)
        left -= opened
    end
    return stacks, left
end`,
    checks: `local existing = {60, 64, 62}
local stacks, left = candidate(existing, 10, 64, 5)
assert(#stacks == 4 and left == 0)
assert(stacks[1] == 64 and stacks[2] == 64 and stacks[3] == 64 and stacks[4] == 4)
assert(existing[1] == 60 and #existing == 3 and stacks ~= existing)
local full, over = candidate({64, 64}, 200, 64, 3)
assert(#full == 3 and full[3] == 64 and over == 136)
local fresh, rest = candidate({}, 5, 64, 2)
assert(#fresh == 1 and fresh[1] == 5 and rest == 0)
local none, keep = candidate({}, 0, 64, 2)
assert(#none == 0 and keep == 0)
for start = 1, 4 do
    for incoming = 0, 14 do
        local rows, leftover = candidate({start}, incoming, 4, 3)
        local total = leftover
        assert(leftover >= 0 and #rows <= 3)
        for _, count in ipairs(rows) do
            assert(count >= 1 and count <= 4)
            total += count
        end
        assert(total == start + incoming)
        if #rows < 3 then assert(leftover == 0) end
        if leftover > 0 then
            for _, count in ipairs(rows) do assert(count == 4) end
        end
    end
end
assert(candidate({0}, 1, 4, 2) == nil)
assert(candidate({5}, 1, 4, 2) == nil)
assert(candidate({1, 1, 1}, 1, 4, 2) == nil)
assert(candidate({1}, -1, 4, 2) == nil)
assert(candidate({1}, 1, 0, 2) == nil)
assert(candidate({1}, 1, 4, 0) == nil)
assert(candidate({1.5}, 1, 4, 2) == nil)
assert(candidate({1}, 1.5, 4, 2) == nil)
assert(candidate({1}, 0/0, 4, 2) == nil)
assert(candidate({1}, math.huge, 4, 2) == nil)
assert(candidate({1}, 1, 4, "2") == nil)
assert(candidate(nil, 1, 4, 2) == nil)
assert(candidate({[1] = 1, [3] = 1}, 1, 4, 3) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, 1, 4, 2) == nil)`,
    mutation: ['local moved = math.min(room, left)', 'local moved = room'],
  },
  {
    id: 'trade-offer-check', family: 'trade-validation',
    prompt: 'Write a standalone Luau module returning check(offer, request, ownedByOffer, ownedByRequest, maxItems). offer and request must be plain maps from nonempty item names to positive safe integers, the two owned maps the same shape with nonnegative counts, and maxItems a positive safe integer. Return false plus a reason string, or true plus nil. Reasons are checked in this order: "invalid-input", "empty-side" when either side lists nothing, "too-many-items" when either side lists more than maxItems entries, "duplicate-item" when an item appears on both sides, and "insufficient-stock" when a side does not own everything it offers. This is pure trade validation, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `local function counted(map, positiveOnly)
    if type(map) ~= "table" or getmetatable(map) ~= nil then return nil end
    local size = 0
    for item, count in pairs(map) do
        if type(item) ~= "string" or item == "" or not integer(count) or count < 0 then return nil end
        if positiveOnly and count <= 0 then return nil end
        size += 1
    end
    return size
end
return function(offer, request, ownedByOffer, ownedByRequest, maxItems)
    local offerSize = counted(offer, true)
    local requestSize = counted(request, true)
    if offerSize == nil or requestSize == nil then return false, "invalid-input" end
    if counted(ownedByOffer, false) == nil or counted(ownedByRequest, false) == nil then return false, "invalid-input" end
    if not integer(maxItems) or maxItems <= 0 then return false, "invalid-input" end
    if offerSize == 0 or requestSize == 0 then return false, "empty-side" end
    if offerSize > maxItems or requestSize > maxItems then return false, "too-many-items" end
    for item in pairs(offer) do
        if request[item] ~= nil then return false, "duplicate-item" end
    end
    for item, count in pairs(offer) do
        if (ownedByOffer[item] or 0) < count then return false, "insufficient-stock" end
    end
    for item, count in pairs(request) do
        if (ownedByRequest[item] or 0) < count then return false, "insufficient-stock" end
    end
    return true, nil
end`,
    checks: `local ok, reason = candidate({sword = 1}, {gem = 2}, {sword = 3}, {gem = 2}, 4)
assert(ok == true and reason == nil)
local ok2, reason2 = candidate({sword = 3}, {gem = 2}, {sword = 3}, {gem = 2}, 4)
assert(ok2 == true and reason2 == nil)
local ok3, reason3 = candidate({sword = 1}, {sword = 1}, {sword = 3}, {sword = 3}, 4)
assert(ok3 == false and reason3 == "duplicate-item")
local ok4, reason4 = candidate({sword = 4}, {gem = 1}, {sword = 3}, {gem = 1}, 4)
assert(ok4 == false and reason4 == "insufficient-stock")
local ok5, reason5 = candidate({sword = 1}, {gem = 1}, {sword = 1}, {}, 4)
assert(ok5 == false and reason5 == "insufficient-stock")
local ok6, reason6 = candidate({}, {gem = 1}, {}, {gem = 1}, 4)
assert(ok6 == false and reason6 == "empty-side")
local ok7, reason7 = candidate({a = 1, b = 1, c = 1}, {gem = 1}, {a = 1, b = 1, c = 1}, {gem = 1}, 2)
assert(ok7 == false and reason7 == "too-many-items")
local ok8, reason8 = candidate({sword = 9}, {sword = 1}, {sword = 1}, {sword = 1}, 4)
assert(ok8 == false and reason8 == "duplicate-item")
assert(select(2, candidate({sword = 0}, {gem = 1}, {sword = 1}, {gem = 1}, 4)) == "invalid-input")
assert(select(2, candidate({sword = 1}, {gem = 1}, {sword = -1}, {gem = 1}, 4)) == "invalid-input")
assert(select(2, candidate({sword = 1}, {gem = 1}, {sword = 1}, {gem = 1}, 0)) == "invalid-input")
assert(select(2, candidate({sword = 1}, {gem = 1}, {sword = 1}, {gem = 1}, 1.5)) == "invalid-input")
assert(select(2, candidate({[""] = 1}, {gem = 1}, {}, {gem = 1}, 4)) == "invalid-input")
assert(select(2, candidate({sword = 1.5}, {gem = 1}, {sword = 2}, {gem = 1}, 4)) == "invalid-input")
assert(select(2, candidate({sword = 0/0}, {gem = 1}, {sword = 2}, {gem = 1}, 4)) == "invalid-input")
assert(select(2, candidate({sword = math.huge}, {gem = 1}, {sword = 2}, {gem = 1}, 4)) == "invalid-input")
assert(select(2, candidate({[1] = 1}, {gem = 1}, {}, {gem = 1}, 4)) == "invalid-input")
assert(select(2, candidate(nil, {gem = 1}, {}, {gem = 1}, 4)) == "invalid-input")
local protected = setmetatable({}, {})
assert(select(2, candidate(protected, {gem = 1}, {}, {gem = 1}, 4)) == "invalid-input")
assert(select(2, candidate({sword = 1}, {gem = 1}, protected, {gem = 1}, 4)) == "invalid-input")`,
    mutation: ['if (ownedByOffer[item] or 0) < count then return false, "insufficient-stock" end', 'if (ownedByOffer[item] or 0) <= count then return false, "insufficient-stock" end'],
  },
  {
    id: 'auction-bid', family: 'auction-bidding',
    prompt: 'Write a standalone Luau module returning bid(highBid, highBidder, amount, bidder, increment, now, endsAt, antiSnipe). highBid must be a nonnegative safe integer, amount and increment positive safe integers, now, endsAt and antiSnipe finite numbers with antiSnipe nonnegative, bidder a nonempty string, and highBidder nil exactly when highBid is zero and a nonempty string otherwise; anything else returns nil. Return accepted plus the resulting high bid, high bidder and deadline. Refuse unchanged when now is at or past endsAt, when the bidder already leads, or when amount is below highBid plus increment; otherwise accept and push the deadline to now plus antiSnipe whenever less than antiSnipe remained. This is pure auction arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + finiteNumber + `return function(highBid, highBidder, amount, bidder, increment, now, endsAt, antiSnipe)
    if not integer(highBid) or highBid < 0 or not integer(amount) or amount <= 0 then return nil end
    if not integer(increment) or increment <= 0 then return nil end
    if not finite(now) or not finite(endsAt) or not finite(antiSnipe) or antiSnipe < 0 then return nil end
    if type(bidder) ~= "string" or bidder == "" then return nil end
    if highBid == 0 then
        if highBidder ~= nil then return nil end
    elseif type(highBidder) ~= "string" or highBidder == "" then
        return nil
    end
    if now >= endsAt then return false, highBid, highBidder, endsAt end
    if bidder == highBidder then return false, highBid, highBidder, endsAt end
    if amount < highBid + increment then return false, highBid, highBidder, endsAt end
    local closing = endsAt
    if endsAt - now < antiSnipe then closing = now + antiSnipe end
    return true, amount, bidder, closing
end`,
    checks: `local ok, bid, bidder, ends = candidate(0, nil, 10, "ana", 5, 0, 100, 15)
assert(ok == true and bid == 10 and bidder == "ana" and ends == 100)
local ok2, bid2, bidder2, ends2 = candidate(10, "ana", 14, "bo", 5, 0, 100, 15)
assert(ok2 == false and bid2 == 10 and bidder2 == "ana" and ends2 == 100)
local ok3, bid3, bidder3, ends3 = candidate(10, "ana", 15, "bo", 5, 0, 100, 15)
assert(ok3 == true and bid3 == 15 and bidder3 == "bo" and ends3 == 100)
local ok4, _, _, ends4 = candidate(10, "ana", 15, "bo", 5, 90, 100, 15)
assert(ok4 == true and ends4 == 105)
local ok5, _, _, ends5 = candidate(10, "ana", 15, "bo", 5, 85, 100, 15)
assert(ok5 == true and ends5 == 100)
local ok6, bid6, bidder6 = candidate(10, "ana", 50, "ana", 5, 0, 100, 15)
assert(ok6 == false and bid6 == 10 and bidder6 == "ana")
local ok7, bid7 = candidate(10, "ana", 500, "bo", 5, 100, 100, 15)
assert(ok7 == false and bid7 == 10)
for amount = 1, 30 do
    local accepted = candidate(10, "ana", amount, "bo", 5, 0, 100, 0)
    assert(accepted == (amount >= 15))
end
assert(candidate(0, "ana", 10, "bo", 5, 0, 100, 15) == nil)
assert(candidate(10, nil, 15, "bo", 5, 0, 100, 15) == nil)
assert(candidate(10, "", 15, "bo", 5, 0, 100, 15) == nil)
assert(candidate(10, "ana", 0, "bo", 5, 0, 100, 15) == nil)
assert(candidate(10, "ana", 15, "", 5, 0, 100, 15) == nil)
assert(candidate(10, "ana", 15, 5, 5, 0, 100, 15) == nil)
assert(candidate(10, "ana", 15, "bo", 0, 0, 100, 15) == nil)
assert(candidate(10, "ana", 15, "bo", 5, 0/0, 100, 15) == nil)
assert(candidate(10, "ana", 15, "bo", 5, 0, math.huge, 15) == nil)
assert(candidate(10, "ana", 15, "bo", 5, 0, 100, -1) == nil)
assert(candidate(10.5, "ana", 15, "bo", 5, 0, 100, 15) == nil)
assert(candidate(10, "ana", 15.5, "bo", 5, 0, 100, 15) == nil)
assert(candidate("10", "ana", 15, "bo", 5, 0, 100, 15) == nil)`,
    mutation: ['if amount < highBid + increment then', 'if amount < highBid then'],
  },
  {
    id: 'token-bucket-spend', family: 'token-bucket',
    prompt: 'Write a standalone Luau module returning spend(tokens, capacity, refillPerSecond, elapsed, cost). All five arguments must be finite numbers with capacity positive, tokens in [0, capacity], refillPerSecond positive, elapsed nonnegative and cost positive; anything else returns nil. Refill by refillPerSecond times elapsed capped at capacity, then return whether the cost fits and the tokens remaining afterwards, leaving the refilled balance untouched on refusal. This is pure rate-limit arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(tokens, capacity, refillPerSecond, elapsed, cost)
    if not finite(tokens) or not finite(capacity) or not finite(refillPerSecond) then return nil end
    if not finite(elapsed) or not finite(cost) then return nil end
    if tokens < 0 or capacity <= 0 or tokens > capacity or refillPerSecond <= 0 or elapsed < 0 or cost <= 0 then return nil end
    local refilled = tokens + refillPerSecond * elapsed
    if not finite(refilled) or refilled > capacity then refilled = capacity end
    if refilled < cost then return false, refilled end
    return true, refilled - cost
end`,
    checks: `local ok, left = candidate(0, 5, 1, 0, 1)
assert(ok == false and left == 0)
local ok2, left2 = candidate(0, 5, 1, 3, 1)
assert(ok2 == true and left2 == 2)
local ok3, left3 = candidate(0, 5, 1, 100, 1)
assert(ok3 == true and left3 == 4)
local ok4, left4 = candidate(5, 5, 1, 0, 5)
assert(ok4 == true and left4 == 0)
local ok5, left5 = candidate(5, 5, 1, 0, 6)
assert(ok5 == false and left5 == 5)
local ok6, left6 = candidate(1, 5, 1e300, 1e300, 1)
assert(ok6 == true and left6 == 4)
local held = 5
local allowed = 0
for _ = 1, 10 do
    local granted, remaining = candidate(held, 5, 1, 1, 2)
    assert(remaining >= 0 and remaining <= 5)
    if granted then allowed += 1 end
    held = remaining
end
assert(allowed == 7)
assert(candidate(6, 5, 1, 1, 1) == nil)
assert(candidate(-1, 5, 1, 1, 1) == nil)
assert(candidate(1, 0, 1, 1, 1) == nil)
assert(candidate(1, 5, 0, 1, 1) == nil)
assert(candidate(1, 5, 1, -1, 1) == nil)
assert(candidate(1, 5, 1, 1, 0) == nil)
assert(candidate(0/0, 5, 1, 1, 1) == nil)
assert(candidate(1, math.huge, 1, 1, 1) == nil)
assert(candidate(1, 5, 1, math.huge, 1) == nil)
assert(candidate("1", 5, 1, 1, 1) == nil)`,
    mutation: ['if not finite(refilled) or refilled > capacity then refilled = capacity end', 'if not finite(refilled) then refilled = capacity end'],
  },
  {
    id: 'speed-audit', family: 'movement-speed-audit',
    prompt: 'Write a standalone Luau module returning audit(distance, elapsed, maxSpeed, tolerance, grace). All five arguments must be finite numbers with distance nonnegative, elapsed positive, maxSpeed positive, tolerance at least 1 and grace nonnegative; anything else returns nil. Return whether the movement is suspicious and the measured speed, flagging only a distance strictly greater than maxSpeed * tolerance * elapsed + grace and never flagging when that allowance is not finite. This is pure movement auditing, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(distance, elapsed, maxSpeed, tolerance, grace)
    if not finite(distance) or not finite(elapsed) or not finite(maxSpeed) then return nil end
    if not finite(tolerance) or not finite(grace) then return nil end
    if distance < 0 or elapsed <= 0 or maxSpeed <= 0 or tolerance < 1 or grace < 0 then return nil end
    local allowance = maxSpeed * tolerance * elapsed + grace
    if not finite(allowance) then return false, distance / elapsed end
    return distance > allowance, distance / elapsed
end`,
    checks: `local flagged, speed = candidate(10, 1, 16, 1, 0)
assert(flagged == false and speed == 10)
local flagged2, speed2 = candidate(20, 1, 16, 1, 0)
assert(flagged2 == true and speed2 == 20)
assert(candidate(16, 1, 16, 1, 0) == false)
assert(candidate(20, 1, 16, 1.25, 0) == false)
assert(candidate(21, 1, 16, 1.25, 0) == true)
assert(candidate(24, 1, 16, 1, 8) == false)
assert(candidate(25, 1, 16, 1, 8) == true)
local flagged3, speed3 = candidate(32, 2, 16, 1, 0)
assert(flagged3 == false and speed3 == 16)
assert(candidate(1e300, 1, 1e300, 1e300, 0) == false)
for distance = 0, 40 do
    local flag, measured = candidate(distance, 2, 10, 1, 0)
    assert(measured == distance / 2)
    assert(flag == (distance > 20))
end
assert(candidate(-1, 1, 16, 1, 0) == nil)
assert(candidate(1, 0, 16, 1, 0) == nil)
assert(candidate(1, -1, 16, 1, 0) == nil)
assert(candidate(1, 1, 0, 1, 0) == nil)
assert(candidate(1, 1, 16, 0.99, 0) == nil)
assert(candidate(1, 1, 16, 1, -1) == nil)
assert(candidate(0/0, 1, 16, 1, 0) == nil)
assert(candidate(1, math.huge, 16, 1, 0) == nil)
assert(candidate(1, 1, 16, math.huge, 0) == nil)
assert(candidate("1", 1, 16, 1, 0) == nil)`,
    mutation: ['return distance > allowance, distance / elapsed', 'return distance >= allowance, distance / elapsed'],
  },
  {
    id: 'seat-assignment', family: 'vehicle-seating',
    prompt: 'Write a standalone Luau module returning sit(seats, userId, preferred). seats must be a plain nonempty array whose entries are either false for empty or a nonempty unique occupant string, userId a nonempty string, and preferred either nil or a safe integer seat index inside the array; anything else returns nil, as does an already seated user or a full vehicle. Take the preferred seat when it is free, otherwise the lowest-index free seat, and return the chosen index plus a fresh seats array with the user placed. The input array must not change. This is pure seating logic, not a RemoteEvent handler or persistent save.',
    source: plainArray + `return function(seats, userId, preferred)
    if not array(seats) or #seats == 0 or type(userId) ~= "string" or userId == "" then return nil end
    if preferred ~= nil then
        if type(preferred) ~= "number" or preferred ~= preferred then return nil end
        if preferred % 1 ~= 0 or preferred < 1 or preferred > #seats then return nil end
    end
    local taken = {}
    for i = 1, #seats do
        local occupant = seats[i]
        if occupant ~= false then
            if type(occupant) ~= "string" or occupant == "" or taken[occupant] then return nil end
            taken[occupant] = true
        end
    end
    if taken[userId] then return nil end
    local chosen = nil
    if preferred ~= nil and seats[preferred] == false then
        chosen = preferred
    else
        for i = 1, #seats do
            if seats[i] == false then
                chosen = i
                break
            end
        end
    end
    if chosen == nil then return nil end
    local placed = {}
    for i = 1, #seats do
        placed[i] = seats[i]
    end
    placed[chosen] = userId
    return chosen, placed
end`,
    checks: `local seats = {"ana", false, false}
local index, placed = candidate(seats, "bo", nil)
assert(index == 2 and placed[1] == "ana" and placed[2] == "bo" and placed[3] == false)
assert(seats[2] == false and placed ~= seats and #seats == 3)
local index2, placed2 = candidate(seats, "bo", 3)
assert(index2 == 3 and placed2[3] == "bo" and placed2[2] == false)
local index3 = candidate(seats, "bo", 1)
assert(index3 == 2)
local index4, placed4 = candidate({false}, "bo", 1)
assert(index4 == 1 and placed4[1] == "bo")
assert(candidate(seats, "ana", nil) == nil)
assert(candidate({"ana", "bo"}, "cy", nil) == nil)
assert(candidate(seats, "bo", 4) == nil)
assert(candidate(seats, "bo", 0) == nil)
assert(candidate(seats, "bo", 1.5) == nil)
assert(candidate(seats, "bo", 0/0) == nil)
assert(candidate(seats, "bo", math.huge) == nil)
assert(candidate(seats, "bo", "1") == nil)
assert(candidate(seats, "", nil) == nil)
assert(candidate(seats, 5, nil) == nil)
assert(candidate({}, "bo", nil) == nil)
assert(candidate({"ana", "ana"}, "bo", nil) == nil)
assert(candidate({true}, "bo", nil) == nil)
assert(candidate({""}, "bo", nil) == nil)
assert(candidate(nil, "bo", nil) == nil)
assert(candidate({[1] = false, [3] = false}, "bo", nil) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, "bo", nil) == nil)`,
    mutation: ['if preferred ~= nil and seats[preferred] == false then', 'if preferred ~= nil then'],
  },
  {
    id: 'elevator-next-floor', family: 'elevator-dispatch',
    prompt: 'Write a standalone Luau module returning nextFloor(current, direction, requests, topFloor). current and topFloor must be safe integers with topFloor positive and current in [1, topFloor], direction exactly "up", "down" or "idle", and requests a plain array of unique safe integer floors inside [1, topFloor]; anything else returns nil. A request for the current floor wins and reports "idle". Otherwise keep going the current way to the nearest request in that direction and only reverse when none remains, with "idle" preferring upward, returning the floor and the direction travelled, or nil when nothing is requested. This is pure dispatch logic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + plainArray + `return function(current, direction, requests, topFloor)
    if not integer(current) or not integer(topFloor) or topFloor < 1 or current < 1 or current > topFloor then return nil end
    if direction ~= "up" and direction ~= "down" and direction ~= "idle" then return nil end
    if not array(requests) then return nil end
    local seen = {}
    local above, below = nil, nil
    for i = 1, #requests do
        local floor = requests[i]
        if not integer(floor) or floor < 1 or floor > topFloor or seen[floor] then return nil end
        seen[floor] = true
        if floor > current and (above == nil or floor < above) then above = floor end
        if floor < current and (below == nil or floor > below) then below = floor end
    end
    if seen[current] then return current, "idle" end
    if direction == "down" then
        if below ~= nil then return below, "down" end
        if above ~= nil then return above, "up" end
        return nil
    end
    if above ~= nil then return above, "up" end
    if below ~= nil then return below, "down" end
    return nil
end`,
    checks: `local floor, heading = candidate(3, "up", {1, 5, 8}, 10)
assert(floor == 5 and heading == "up")
local floor2, heading2 = candidate(3, "down", {1, 5, 8}, 10)
assert(floor2 == 1 and heading2 == "down")
local floor3, heading3 = candidate(3, "down", {5, 8}, 10)
assert(floor3 == 5 and heading3 == "up")
local floor4, heading4 = candidate(3, "up", {1, 2}, 10)
assert(floor4 == 2 and heading4 == "down")
local floor5, heading5 = candidate(3, "idle", {1, 5}, 10)
assert(floor5 == 5 and heading5 == "up")
local floor6, heading6 = candidate(3, "up", {3, 8}, 10)
assert(floor6 == 3 and heading6 == "idle")
for current = 1, 6 do
    for _, heading7 in {"up", "down", "idle"} do
        local target, travel = candidate(current, heading7, {1, 4, 6}, 6)
        assert(target ~= nil)
        if target == current then
            assert(travel == "idle")
        else
            assert(travel == (if target > current then "up" else "down"))
        end
    end
end
assert(candidate(3, "up", {}, 10) == nil)
assert(candidate(3, "sideways", {5}, 10) == nil)
assert(candidate(3, nil, {5}, 10) == nil)
assert(candidate(0, "up", {5}, 10) == nil)
assert(candidate(11, "up", {5}, 10) == nil)
assert(candidate(3, "up", {11}, 10) == nil)
assert(candidate(3, "up", {0}, 10) == nil)
assert(candidate(3, "up", {5, 5}, 10) == nil)
assert(candidate(3, "up", {5.5}, 10) == nil)
assert(candidate(3, "up", {0/0}, 10) == nil)
assert(candidate(3, "up", {math.huge}, 10) == nil)
assert(candidate(3.5, "up", {5}, 10) == nil)
assert(candidate(3, "up", {5}, 0) == nil)
assert(candidate("3", "up", {5}, 10) == nil)
assert(candidate(3, "up", nil, 10) == nil)
assert(candidate(3, "up", {[1] = 5, [3] = 6}, 10) == nil)
local protected = setmetatable({}, {})
assert(candidate(3, "up", protected, 10) == nil)`,
    mutation: ['if direction == "down" then', 'if direction == "idle" then'],
  },
  {
    id: 'day-night-phase', family: 'day-night-phase',
    prompt: 'Write a standalone Luau module returning phase(elapsed, dayLength, nightLength). All three arguments must be finite numbers with elapsed nonnegative and both lengths positive, and the combined cycle must stay finite; anything else returns nil. Day runs first, so return "day" and the seconds left in it while the position inside the cycle is strictly below dayLength, otherwise "night" and the seconds left in the cycle. This is pure cycle arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(elapsed, dayLength, nightLength)
    if not finite(elapsed) or not finite(dayLength) or not finite(nightLength) then return nil end
    if elapsed < 0 or dayLength <= 0 or nightLength <= 0 then return nil end
    local cycle = dayLength + nightLength
    if not finite(cycle) then return nil end
    local position = elapsed % cycle
    if position < dayLength then return "day", dayLength - position end
    return "night", cycle - position
end`,
    checks: `local name, remaining = candidate(0, 10, 5)
assert(name == "day" and remaining == 10)
local name2, remaining2 = candidate(9.5, 10, 5)
assert(name2 == "day" and remaining2 == 0.5)
local name3, remaining3 = candidate(10, 10, 5)
assert(name3 == "night" and remaining3 == 5)
local name4, remaining4 = candidate(14, 10, 5)
assert(name4 == "night" and remaining4 == 1)
local name5, remaining5 = candidate(15, 10, 5)
assert(name5 == "day" and remaining5 == 10)
local name6, remaining6 = candidate(1507, 10, 5)
assert(name6 == "day" and remaining6 == 3)
for step = 0, 60 do
    local at = step / 2
    local phase, left = candidate(at, 4, 3)
    assert(phase == "day" or phase == "night")
    assert(left > 0 and left <= (if phase == "day" then 4 else 3))
    assert(candidate(at + left, 4, 3) ~= phase)
end
assert(candidate(-1, 10, 5) == nil)
assert(candidate(1, 0, 5) == nil)
assert(candidate(1, -1, 5) == nil)
assert(candidate(1, 10, 0) == nil)
assert(candidate(0/0, 10, 5) == nil)
assert(candidate(math.huge, 10, 5) == nil)
assert(candidate(1, math.huge, 5) == nil)
assert(candidate(1, 1e308, 1e308) == nil)
assert(candidate("1", 10, 5) == nil)`,
    mutation: ['if position < dayLength then return "day", dayLength - position end', 'if position <= dayLength then return "day", dayLength - position end'],
  },
  {
    id: 'wave-difficulty', family: 'wave-scaling',
    prompt: 'Write a standalone Luau module returning wave(index, baseCount, growth, maximumCount, bossEvery). All five arguments must be finite safe integers with index at least 1, baseCount at least 1, growth nonnegative, maximumCount no smaller than baseCount and bossEvery at least 1; anything else returns nil. Return the enemy count, which is baseCount plus growth for every wave after the first, capped at maximumCount, and a boolean that is true exactly when index is a multiple of bossEvery. This is pure difficulty arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `return function(index, baseCount, growth, maximumCount, bossEvery)
    if not integer(index) or not integer(baseCount) or not integer(growth) then return nil end
    if not integer(maximumCount) or not integer(bossEvery) then return nil end
    if index < 1 or baseCount < 1 or growth < 0 or maximumCount < baseCount or bossEvery < 1 then return nil end
    local headroom = maximumCount - baseCount
    local extra = math.min(growth * (index - 1), headroom)
    return baseCount + extra, index % bossEvery == 0
end`,
    checks: `for index = 1, 20 do
    local count, boss = candidate(index, 5, 3, 26, 5)
    assert(count == math.min(5 + 3 * (index - 1), 26))
    assert(boss == (index % 5 == 0))
end
local count, boss = candidate(1, 5, 3, 26, 5)
assert(count == 5 and boss == false)
local count2, boss2 = candidate(5, 5, 3, 26, 5)
assert(count2 == 17 and boss2 == true)
assert(candidate(100, 5, 3, 26, 5) == 26)
local count3, boss3 = candidate(3, 5, 0, 26, 1)
assert(count3 == 5 and boss3 == true)
assert(candidate(9007199254740991, 1, 9007199254740991, 50, 5) == 50)
assert(candidate(0, 5, 3, 26, 5) == nil)
assert(candidate(1, 0, 3, 26, 5) == nil)
assert(candidate(1, 5, -1, 26, 5) == nil)
assert(candidate(1, 5, 3, 4, 5) == nil)
assert(candidate(1, 5, 3, 26, 0) == nil)
assert(candidate(1.5, 5, 3, 26, 5) == nil)
assert(candidate(0/0, 5, 3, 26, 5) == nil)
assert(candidate(math.huge, 5, 3, 26, 5) == nil)
assert(candidate(1, 5, 3, math.huge, 5) == nil)
assert(candidate("1", 5, 3, 26, 5) == nil)`,
    mutation: ['math.min(growth * (index - 1), headroom)', 'math.min(growth * index, headroom)'],
  },
  {
    id: 'combo-multiplier', family: 'combo-multiplier',
    prompt: 'Write a standalone Luau module returning combo(multiplier, idle, decayPerSecond, step, maximum). All five arguments must be finite numbers with maximum at least 1, multiplier in [1, maximum], idle nonnegative, decayPerSecond nonnegative and step positive; anything else returns nil. Decay the multiplier by decayPerSecond for each idle second with a floor of 1, then add step and cap the result at maximum, treating a non-finite intermediate as the relevant bound. This is pure scoring arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(multiplier, idle, decayPerSecond, step, maximum)
    if not finite(multiplier) or not finite(idle) or not finite(decayPerSecond) then return nil end
    if not finite(step) or not finite(maximum) then return nil end
    if maximum < 1 or multiplier < 1 or multiplier > maximum or idle < 0 or decayPerSecond < 0 or step <= 0 then return nil end
    local decayed = multiplier - decayPerSecond * idle
    if not finite(decayed) or decayed < 1 then decayed = 1 end
    local raised = decayed + step
    if not finite(raised) or raised > maximum then return maximum end
    return raised
end`,
    checks: `assert(candidate(1, 0, 0.5, 0.5, 4) == 1.5)
assert(candidate(3, 2, 0.5, 0.5, 4) == 2.5)
assert(candidate(3, 100, 0.5, 0.5, 4) == 1.5)
assert(candidate(3.8, 0, 0.5, 0.5, 4) == 4)
assert(candidate(4, 0, 0.5, 0.5, 4) == 4)
assert(candidate(1, 0, 0, 3, 4) == 4)
assert(candidate(1, 10, 0, 0.5, 4) == 1.5)
assert(candidate(2, 1e300, 1e300, 0.5, 4) == 1.5)
assert(candidate(2, 1, 0.5, 1e300, 4) == 4)
for step = 0, 40 do
    local idle = step / 4
    local value = candidate(2.5, idle, 0.4, 0.25, 3)
    assert(value >= 1 and value <= 3)
end
assert(candidate(0.5, 0, 0.5, 0.5, 4) == nil)
assert(candidate(5, 0, 0.5, 0.5, 4) == nil)
assert(candidate(1, -1, 0.5, 0.5, 4) == nil)
assert(candidate(1, 0, -1, 0.5, 4) == nil)
assert(candidate(1, 0, 0.5, 0, 4) == nil)
assert(candidate(1, 0, 0.5, 0.5, 0.5) == nil)
assert(candidate(0/0, 0, 0.5, 0.5, 4) == nil)
assert(candidate(1, math.huge, 0.5, 0.5, 4) == nil)
assert(candidate(1, 0, 0.5, 0.5, math.huge) == nil)
assert(candidate("1", 0, 0.5, 0.5, 4) == nil)`,
    mutation: ['if not finite(decayed) or decayed < 1 then decayed = 1 end', 'if not finite(decayed) then decayed = 1 end'],
  },
  {
    id: 'leaderboard-insert', family: 'top-n-insertion',
    prompt: 'Write a standalone Luau module returning insert(board, userId, score, limit). board must be a plain array of at most limit plain records {userId = nonempty unique string, score = finite number} already ordered by non-increasing score, userId a nonempty string, score a finite number, and limit a positive safe integer; anything else returns nil. Return a fresh board and the new 1-based rank, or the fresh board and nil when the entry does not place. A returning user keeps their better score and never occupies two rows, and a score equal to an incumbent ranks below it. This is pure leaderboard arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + safeInteger + plainArray + `return function(board, userId, score, limit)
    if not array(board) or type(userId) ~= "string" or userId == "" then return nil end
    if not finite(score) or not integer(limit) or limit < 1 or #board > limit then return nil end
    local rows = {}
    local seen = {}
    local previous = nil
    for i = 1, #board do
        local row = board[i]
        if type(row) ~= "table" or getmetatable(row) ~= nil then return nil end
        local id = row.userId
        local value = row.score
        if type(id) ~= "string" or id == "" or seen[id] or not finite(value) then return nil end
        if previous ~= nil and value > previous then return nil end
        seen[id] = true
        previous = value
        rows[i] = {userId = id, score = value}
    end
    local existing = nil
    for i = 1, #rows do
        if rows[i].userId == userId then existing = i end
    end
    if existing ~= nil then
        if rows[existing].score >= score then return rows, nil end
        table.remove(rows, existing)
    end
    local position = #rows + 1
    for i = 1, #rows do
        if score > rows[i].score then
            position = i
            break
        end
    end
    if position > limit then return rows, nil end
    table.insert(rows, position, {userId = userId, score = score})
    if #rows > limit then table.remove(rows) end
    return rows, position
end`,
    checks: `local board = {{userId = "a", score = 90}, {userId = "b", score = 70}, {userId = "c", score = 50}}
local rows, rank = candidate(board, "d", 80, 3)
assert(rank == 2 and #rows == 3)
assert(rows[1].userId == "a" and rows[2].userId == "d" and rows[3].userId == "b")
assert(board[2].userId == "b" and #board == 3 and rows ~= board and rows[1] ~= board[1])
local rows2, rank2 = candidate(board, "d", 10, 3)
assert(rank2 == nil and #rows2 == 3 and rows2[3].userId == "c")
local rows3, rank3 = candidate(board, "d", 10, 4)
assert(rank3 == 4 and #rows3 == 4 and rows3[4].userId == "d")
local rows4, rank4 = candidate(board, "b", 95, 3)
assert(rank4 == 1 and #rows4 == 3)
assert(rows4[1].userId == "b" and rows4[2].userId == "a" and rows4[3].userId == "c")
local rows5, rank5 = candidate(board, "b", 10, 3)
assert(rank5 == nil and #rows5 == 3 and rows5[2].userId == "b" and rows5[2].score == 70)
local rows6, rank6 = candidate(board, "d", 70, 3)
assert(rank6 == 3 and rows6[2].userId == "b" and rows6[3].userId == "d")
local rows7, rank7 = candidate({}, "a", 1, 2)
assert(rank7 == 1 and #rows7 == 1 and rows7[1].score == 1)
local rows8, rank8 = candidate(board, "d", 200, 3)
assert(rank8 == 1 and #rows8 == 3 and rows8[3].userId == "b")
assert(candidate(board, "", 10, 3) == nil)
assert(candidate(board, 5, 10, 3) == nil)
assert(candidate(board, "d", 0/0, 3) == nil)
assert(candidate(board, "d", math.huge, 3) == nil)
assert(candidate(board, "d", 10, 0) == nil)
assert(candidate(board, "d", 10, 2) == nil)
assert(candidate(board, "d", 10, 1.5) == nil)
assert(candidate({{userId = "a", score = 10}, {userId = "b", score = 20}}, "d", 5, 3) == nil)
assert(candidate({{userId = "a", score = 10}, {userId = "a", score = 5}}, "d", 5, 3) == nil)
assert(candidate({{userId = "a", score = "10"}}, "d", 5, 3) == nil)
assert(candidate({{userId = "", score = 10}}, "d", 5, 3) == nil)
assert(candidate({"a"}, "d", 5, 3) == nil)
assert(candidate(nil, "d", 5, 3) == nil)
assert(candidate({[1] = {userId = "a", score = 1}, [3] = {userId = "b", score = 1}}, "d", 5, 3) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, "d", 5, 3) == nil)
assert(candidate({protected}, "d", 5, 3) == nil)`,
    mutation: ['if score > rows[i].score then', 'if score >= rows[i].score then'],
  },
  {
    id: 'spawn-clearance', family: 'spawn-spacing',
    prompt: 'Write a standalone Luau module returning choose(spawns, occupied, minimumDistance). spawns must be a plain nonempty array and occupied a plain array of plain points {x = finite number, z = finite number}, and minimumDistance a finite nonnegative number; anything else returns nil. Return the index of the spawn whose distance to the nearest occupied point is largest with ties going to the lowest index, that clearance, and whether it is at least minimumDistance; with nothing occupied the first spawn wins and its clearance is math.huge. This is pure spacing arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + plainArray + `local function point(value)
    if type(value) ~= "table" or getmetatable(value) ~= nil then return false end
    return finite(value.x) and finite(value.z)
end
return function(spawns, occupied, minimumDistance)
    if not array(spawns) or #spawns == 0 or not array(occupied) then return nil end
    if not finite(minimumDistance) or minimumDistance < 0 then return nil end
    for i = 1, #occupied do
        if not point(occupied[i]) then return nil end
    end
    local bestIndex = nil
    local bestClearance = -1
    for i = 1, #spawns do
        local spawn = spawns[i]
        if not point(spawn) then return nil end
        local clearance = math.huge
        for j = 1, #occupied do
            local dx = spawn.x - occupied[j].x
            local dz = spawn.z - occupied[j].z
            local distance = math.sqrt(dx * dx + dz * dz)
            if distance < clearance then clearance = distance end
        end
        if clearance > bestClearance then
            bestIndex = i
            bestClearance = clearance
        end
    end
    return bestIndex, bestClearance, bestClearance >= minimumDistance
end`,
    checks: `local spawns = {{x = 0, z = 0}, {x = 10, z = 0}, {x = 100, z = 0}}
local index, clearance, ok = candidate(spawns, {{x = 1, z = 0}, {x = 12, z = 0}}, 5)
assert(index == 3 and clearance == 88 and ok == true)
local index2, clearance2, ok2 = candidate(spawns, {{x = 0, z = 3}}, 5)
assert(index2 == 3 and clearance2 == math.sqrt(100 * 100 + 3 * 3) and ok2 == true)
local index3, clearance3, ok3 = candidate({{x = 0, z = 0}, {x = 1, z = 0}}, {{x = 0, z = 0}}, 5)
assert(index3 == 2 and clearance3 == 1 and ok3 == false)
local index4, clearance4, ok4 = candidate(spawns, {}, 5)
assert(index4 == 1 and clearance4 == math.huge and ok4 == true)
local index5, clearance5 = candidate({{x = -4, z = 0}, {x = 4, z = 0}}, {{x = 0, z = 0}}, 1)
assert(index5 == 1 and clearance5 == 4)
local index6, clearance6, ok6 = candidate({{x = 0, z = 0}}, {{x = 0, z = 0}}, 0)
assert(index6 == 1 and clearance6 == 0 and ok6 == true)
candidate(spawns, {{x = 1, z = 0}}, 5)
assert(spawns[1].x == 0 and #spawns == 3)
assert(candidate(spawns, {{x = 1, z = 0}}, -1) == nil)
assert(candidate(spawns, {{x = 1, z = 0}}, 0/0) == nil)
assert(candidate(spawns, {{x = 1, z = 0}}, math.huge) == nil)
assert(candidate(spawns, {{x = 1, z = 0}}, "5") == nil)
assert(candidate({}, {}, 1) == nil)
assert(candidate({{x = 0}}, {}, 1) == nil)
assert(candidate({{x = 0, z = "0"}}, {}, 1) == nil)
assert(candidate({{x = 0, z = math.huge}}, {}, 1) == nil)
assert(candidate({{x = 0/0, z = 0}}, {}, 1) == nil)
assert(candidate(spawns, {{x = 0}}, 1) == nil)
assert(candidate({"a"}, {}, 1) == nil)
assert(candidate(nil, {}, 1) == nil)
assert(candidate(spawns, nil, 1) == nil)
assert(candidate({[1] = {x = 0, z = 0}, [3] = {x = 1, z = 1}}, {}, 1) == nil)
local protected = setmetatable({}, {})
assert(candidate({protected}, {}, 1) == nil)
assert(candidate(protected, {}, 1) == nil)`,
    mutation: ['if distance < clearance then clearance = distance end', 'if distance > clearance then clearance = distance end'],
  },
  {
    id: 'chest-respawn', family: 'chest-respawn',
    prompt: 'Write a standalone Luau module returning state(lootedAt, now, respawnTime). now must be a finite number and respawnTime a finite positive number; lootedAt is either nil, meaning never looted, or a finite number no later than now. Anything else returns nil. Return whether the chest is available and the seconds still to wait, which is zero whenever it is available and respawnTime minus the elapsed time otherwise, with the boundary counting as available. This is pure respawn arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(lootedAt, now, respawnTime)
    if not finite(now) or not finite(respawnTime) or respawnTime <= 0 then return nil end
    if lootedAt == nil then return true, 0 end
    if not finite(lootedAt) or now < lootedAt then return nil end
    local elapsed = now - lootedAt
    if elapsed >= respawnTime then return true, 0 end
    return false, respawnTime - elapsed
end`,
    checks: `local ready, remaining = candidate(nil, 100, 30)
assert(ready == true and remaining == 0)
local ready2, remaining2 = candidate(100, 100, 30)
assert(ready2 == false and remaining2 == 30)
local ready3, remaining3 = candidate(100, 110, 30)
assert(ready3 == false and remaining3 == 20)
local ready4, remaining4 = candidate(100, 130, 30)
assert(ready4 == true and remaining4 == 0)
local ready5, remaining5 = candidate(100, 500, 30)
assert(ready5 == true and remaining5 == 0)
for step = 0, 40 do
    local now = 100 + step / 2
    local open, left = candidate(100, now, 10)
    assert(open == (now - 100 >= 10))
    assert(left == (if open then 0 else 10 - (now - 100)))
    assert(left >= 0 and left <= 10)
end
assert(candidate(100, 99, 30) == nil)
assert(candidate(100, 100, 0) == nil)
assert(candidate(100, 100, -1) == nil)
assert(candidate("100", 100, 30) == nil)
assert(candidate(0/0, 100, 30) == nil)
assert(candidate(math.huge, 200, 30) == nil)
assert(candidate(100, 0/0, 30) == nil)
assert(candidate(100, math.huge, 30) == nil)
assert(candidate(100, 100, math.huge) == nil)
assert(candidate(100, 100, "30") == nil)`,
    mutation: ['if elapsed >= respawnTime then return true, 0 end', 'if elapsed > respawnTime then return true, 0 end'],
  },
  {
    id: 'tool-durability', family: 'tool-durability',
    prompt: 'Write a standalone Luau module returning swing(durability, wear, swings). All three arguments must be finite safe integers with durability nonnegative, wear positive and swings nonnegative; anything else returns nil. A swing is only possible while the durability still covers the wear, so return the durability left, how many of the requested swings actually happened, and whether the tool is now spent, meaning the remainder is below wear. This is pure durability arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `return function(durability, wear, swings)
    if not integer(durability) or not integer(wear) or not integer(swings) then return nil end
    if durability < 0 or wear <= 0 or swings < 0 then return nil end
    local possible = math.min(swings, math.floor(durability / wear))
    local remaining = durability - possible * wear
    return remaining, possible, remaining < wear
end`,
    checks: `local left, used, spent = candidate(10, 3, 2)
assert(left == 4 and used == 2 and spent == false)
local left2, used2, spent2 = candidate(10, 3, 5)
assert(left2 == 1 and used2 == 3 and spent2 == true)
local left3, used3, spent3 = candidate(10, 3, 0)
assert(left3 == 10 and used3 == 0 and spent3 == false)
local left4, used4, spent4 = candidate(0, 3, 4)
assert(left4 == 0 and used4 == 0 and spent4 == true)
local left5, used5, spent5 = candidate(9, 3, 3)
assert(left5 == 0 and used5 == 3 and spent5 == true)
for durability = 0, 20 do
    for swings = 0, 8 do
        local remaining, performed, dead = candidate(durability, 3, swings)
        assert(performed == math.min(swings, math.floor(durability / 3)))
        assert(remaining == durability - performed * 3)
        assert(remaining >= 0 and remaining <= durability)
        assert(dead == (remaining < 3))
    end
end
assert(candidate(-1, 3, 1) == nil)
assert(candidate(10, 0, 1) == nil)
assert(candidate(10, -3, 1) == nil)
assert(candidate(10, 3, -1) == nil)
assert(candidate(10.5, 3, 1) == nil)
assert(candidate(10, 3, 1.5) == nil)
assert(candidate(0/0, 3, 1) == nil)
assert(candidate(math.huge, 3, 1) == nil)
assert(candidate(10, math.huge, 1) == nil)
assert(candidate("10", 3, 1) == nil)`,
    mutation: ['math.min(swings, math.floor(durability / wear))', 'swings'],
  },
  {
    id: 'buff-stacks', family: 'buff-stacking',
    prompt: 'Write a standalone Luau module returning active(buffs, now, maxStacks). buffs must be a plain array of plain records {id = nonempty string, stacks = positive safe integer, expiresAt = finite number}, now a finite number, and maxStacks a positive safe integer; anything else returns nil. Drop every buff whose expiresAt is at or before now, sum the surviving stacks per id capped at maxStacks, and return that fresh map plus the earliest surviving expiry or nil when none survives. The input must not change. This is pure buff bookkeeping, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + safeInteger + plainArray + `return function(buffs, now, maxStacks)
    if not array(buffs) or not finite(now) or not integer(maxStacks) or maxStacks < 1 then return nil end
    local totals = {}
    local soonest = nil
    for i = 1, #buffs do
        local buff = buffs[i]
        if type(buff) ~= "table" or getmetatable(buff) ~= nil then return nil end
        local id = buff.id
        local stacks = buff.stacks
        local expiresAt = buff.expiresAt
        if type(id) ~= "string" or id == "" or not integer(stacks) or stacks < 1 then return nil end
        if not finite(expiresAt) then return nil end
        if expiresAt > now then
            totals[id] = math.min((totals[id] or 0) + stacks, maxStacks)
            if soonest == nil or expiresAt < soonest then soonest = expiresAt end
        end
    end
    return totals, soonest
end`,
    checks: `local buffs = {
    {id = "haste", stacks = 2, expiresAt = 120},
    {id = "haste", stacks = 3, expiresAt = 90},
    {id = "shield", stacks = 1, expiresAt = 60},
    {id = "rage", stacks = 4, expiresAt = 40},
}
local totals, soonest = candidate(buffs, 50, 4)
assert(totals.haste == 4 and totals.shield == 1 and totals.rage == nil)
assert(soonest == 60)
local totals2, soonest2 = candidate(buffs, 50, 10)
assert(totals2.haste == 5 and totals2.shield == 1 and soonest2 == 60)
local totals3, soonest3 = candidate(buffs, 200, 4)
assert(next(totals3) == nil and soonest3 == nil)
local totals4, soonest4 = candidate({}, 0, 4)
assert(next(totals4) == nil and soonest4 == nil)
local totals5, soonest5 = candidate(buffs, 0, 10)
assert(totals5.rage == 4 and totals5.haste == 5 and soonest5 == 40)
assert(buffs[1].stacks == 2 and #buffs == 4)
assert(next(candidate({{id = "haste", stacks = 1, expiresAt = 50}}, 50, 4)) == nil)
assert(candidate({{id = "haste", stacks = 1, expiresAt = 50.5}}, 50, 4).haste == 1)
assert(candidate(buffs, 0/0, 4) == nil)
assert(candidate(buffs, math.huge, 4) == nil)
assert(candidate(buffs, "50", 4) == nil)
assert(candidate(buffs, 50, 0) == nil)
assert(candidate(buffs, 50, 1.5) == nil)
assert(candidate(buffs, 50, math.huge) == nil)
assert(candidate({{id = "", stacks = 1, expiresAt = 60}}, 50, 4) == nil)
assert(candidate({{id = "a", stacks = 0, expiresAt = 60}}, 50, 4) == nil)
assert(candidate({{id = "a", stacks = 1.5, expiresAt = 60}}, 50, 4) == nil)
assert(candidate({{id = "a", stacks = 1, expiresAt = "60"}}, 50, 4) == nil)
assert(candidate({{id = "a", stacks = 1, expiresAt = math.huge}}, 50, 4) == nil)
assert(candidate({"a"}, 50, 4) == nil)
assert(candidate(nil, 50, 4) == nil)
assert(candidate({[1] = {id = "a", stacks = 1, expiresAt = 60}, [3] = {id = "b", stacks = 1, expiresAt = 60}}, 50, 4) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, 50, 4) == nil)
assert(candidate({protected}, 50, 4) == nil)`,
    mutation: ['math.min((totals[id] or 0) + stacks, maxStacks)', 'math.min(stacks, maxStacks)'],
  },
];
