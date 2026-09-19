/**
 * Additional first-party, engine-independent game-logic seeds.
 *
 * These examples deliberately stay outside the Roblox API surface: each answer is a pure Luau
 * function with bounded inputs, so the verifier can execute the real behaviour locally and can
 * prove that one semantic mutation is rejected by its assertions.
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

export const GAME_LOGIC_CURRICULUM_EXTENSION = [
  {
    id: 'weighted-selection', family: 'weighted-selection',
    prompt: 'Write a standalone Luau module returning pick(weights, ticket). weights must be a plain nonempty array of finite nonnegative numbers whose accumulated total stays finite and positive, and ticket must be finite in the half-open range [0, total). Return the 1-based index selected by cumulative weights, or nil for invalid input or a non-finite total. Do not mutate the array, use randomness, or access Roblox services.',
    source: plainArray + `return function(weights, ticket)
    if not array(weights) or #weights == 0 then return nil end
    if type(ticket) ~= "number" or ticket ~= ticket or math.abs(ticket) == math.huge then return nil end
    local total = 0
    for i = 1, #weights do
        local weight = weights[i]
        if type(weight) ~= "number" or weight ~= weight or math.abs(weight) == math.huge or weight < 0 then return nil end
        total += weight
        if total ~= total or math.abs(total) == math.huge then return nil end
    end
    if total <= 0 or ticket < 0 or ticket >= total then return nil end
    local cumulative = 0
    for i = 1, #weights do
        cumulative += weights[i]
        if ticket < cumulative then return i end
    end
    return nil
end`,
    checks: `local weights = {1, 2, 3}
assert(candidate(weights, 0) == 1)
assert(candidate(weights, 0.999) == 1)
assert(candidate(weights, 1) == 2)
assert(candidate(weights, 2.999) == 2)
assert(candidate(weights, 3) == 3)
assert(candidate(weights, 5.999) == 3)
assert(candidate(weights, 6) == nil)
assert(candidate(weights, -0.01) == nil)
assert(candidate({0, 0, 2}, 0) == 3)
assert(candidate({}, 0) == nil)
assert(candidate({1, -1}, 0) == nil)
assert(candidate({1, math.huge}, 0) == nil)
assert(candidate({9e307, 9e307}, 0) == nil)
assert(candidate(weights, 0/0) == nil)
assert(candidate({[1] = 1, [3] = 1}, 0) == nil)
assert(candidate({[0] = 1}, 0) == nil)
assert(candidate({[1.5] = 1}, 0) == nil)
assert(candidate({1, 2, extra = 3}, 0) == nil)
candidate(weights, 1)
assert(weights[1] == 1 and weights[2] == 2 and weights[3] == 3)`,
    mutation: ['if ticket < cumulative then return i end', 'if ticket <= cumulative then return i end'],
  },
  {
    id: 'interval-overlap', family: 'interval-overlap',
    prompt: 'Write a standalone Luau module returning overlap(aStart, aFinish, bStart, bFinish). All four endpoints must be finite numbers with each start no greater than its finish. Return the length of the intersection, including zero for disjoint or merely touching intervals, and nil for invalid input. Do not use a clock or mutate state.',
    source: finiteNumber + `return function(aStart, aFinish, bStart, bFinish)
    if not finite(aStart) or not finite(aFinish) or not finite(bStart) or not finite(bFinish) then return nil end
    if aStart > aFinish or bStart > bFinish then return nil end
    local start = math.max(aStart, bStart)
    local finish = math.min(aFinish, bFinish)
    if finish <= start then return 0 end
    return finish - start
end`,
    checks: `assert(candidate(0, 5, 2, 7) == 3)
assert(candidate(0, 2, 5, 8) == 0)
assert(candidate(0, 2, 2, 8) == 0)
assert(candidate(3, 6, 0, 10) == 3)
assert(candidate(-4, -1, -3, 2) == 2)
assert(candidate(5, 4, 0, 1) == nil)
assert(candidate(0/0, 1, 0, 1) == nil)
assert(candidate(0, math.huge, 0, 1) == nil)
assert(candidate("0", 1, 0, 1) == nil)`,
    mutation: ['local finish = math.min(aFinish, bFinish)', 'local finish = math.max(aFinish, bFinish)'],
  },
  {
    id: 'merge-ranges', family: 'range-normalization',
    prompt: 'Write a standalone Luau module returning merge(ranges). ranges must be a plain array of records {start = finite number, finish = finite number} with start no greater than finish. Return a fresh array sorted by start, merging overlapping or touching ranges; return nil for invalid input. Preserve the input records and use no services.',
    source: finiteNumber + plainArray + `return function(ranges)
    if not array(ranges) then return nil end
    local sorted = {}
    for i = 1, #ranges do
        local row = ranges[i]
        if type(row) ~= "table" or getmetatable(row) ~= nil then return nil end
        local start = row.start
        local finish = row.finish
        if not finite(start) or not finite(finish) or start > finish then return nil end
        sorted[i] = {start = start, finish = finish}
    end
    table.sort(sorted, function(a, b)
        if a.start == b.start then return a.finish < b.finish end
        return a.start < b.start
    end)
    local merged = {}
    for _, row in ipairs(sorted) do
        local last = merged[#merged]
        if last and row.start <= last.finish then
            if row.finish > last.finish then last.finish = row.finish end
        else
            table.insert(merged, {start = row.start, finish = row.finish})
        end
    end
    return merged
end`,
    checks: `local input = {{start = 5, finish = 7}, {start = 1, finish = 2}, {start = 2, finish = 4}, {start = 10, finish = 10}, {start = 9, finish = 10}}
local result = candidate(input)
assert(#result == 3)
assert(result[1].start == 1 and result[1].finish == 4)
assert(result[2].start == 5 and result[2].finish == 7)
assert(result[3].start == 9 and result[3].finish == 10)
assert(result ~= input and result[1] ~= input[2])
assert(input[1].start == 5 and input[1].finish == 7)
assert(#candidate({}) == 0)
assert(candidate({{start = 4, finish = 3}}) == nil)
assert(candidate({{start = 0, finish = math.huge}}) == nil)
assert(candidate({{start = "0", finish = 1}}) == nil)
assert(candidate({[1] = {start = 0, finish = 1}, [3] = {start = 2, finish = 3}}) == nil)
assert(candidate({[1.5] = {start = 0, finish = 1}}) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected) == nil)`,
    mutation: ['if last and row.start <= last.finish then', 'if last and row.start < last.finish then'],
  },
  {
    id: 'dependency-order', family: 'dependency-order',
    prompt: 'Write a standalone Luau module returning order(nodes, edges). nodes is a plain array of unique nonempty string IDs. edges is a plain array of records {before = ID, after = ID}; endpoints must be known, distinct, and not repeated. Return a deterministic topological order, choosing the lexicographically smallest currently available ID, or nil for invalid data or a cycle. Do not mutate the inputs or access services.',
    source: plainArray + `return function(nodes, edges)
    if not array(nodes) or not array(edges) then return nil end
    local known = {}
    for i = 1, #nodes do
        local id = nodes[i]
        if type(id) ~= "string" or id == "" or known[id] then return nil end
        known[id] = true
    end
    local indegree = {}
    local outgoing = {}
    for i = 1, #nodes do
        indegree[nodes[i]] = 0
        outgoing[nodes[i]] = {}
    end
    for i = 1, #edges do
        local edge = edges[i]
        if type(edge) ~= "table" or getmetatable(edge) ~= nil then return nil end
        local before = edge.before
        local after = edge.after
        if type(before) ~= "string" or type(after) ~= "string" or before == after or not known[before] or not known[after] or outgoing[before][after] then return nil end
        outgoing[before][after] = true
        indegree[after] += 1
    end
    local ready = {}
    local function sortReady()
        table.sort(ready)
    end
    for id in pairs(known) do
        if indegree[id] == 0 then table.insert(ready, id) end
    end
    sortReady()
    local result = {}
    while #ready > 0 do
        local id = table.remove(ready, 1)
        table.insert(result, id)
        for after in pairs(outgoing[id]) do
            indegree[after] -= 1
            if indegree[after] == 0 then table.insert(ready, after) end
        end
        sortReady()
    end
    if #result ~= #nodes then return nil end
    return result
end`,
    checks: `local nodes = {"A", "B", "C", "D"}
local edges = {{before = "A", after = "C"}, {before = "B", after = "C"}, {before = "C", after = "D"}}
local result = candidate(nodes, edges)
assert(table.concat(result, ",") == "A,B,C,D")
assert(nodes[1] == "A" and edges[1].before == "A")
assert(candidate({"A", "B"}, {{before = "X", after = "B"}}) == nil)
assert(candidate({"A", "B"}, {{before = "A", after = "B"}, {before = "A", after = "B"}}) == nil)
assert(candidate({"A", "B"}, {{before = "A", after = "B"}, {before = "B", after = "A"}}) == nil)
assert(candidate({"A", "A"}, {}) == nil)
assert(candidate(nil, {}) == nil)
assert(candidate({[1] = "A", [3] = "B"}, {}) == nil)
assert(candidate({[0] = "A"}, {}) == nil)
assert(candidate({[1.5] = "A"}, {}) == nil)
assert(candidate({"A", "B"}, {[1] = {before = "A", after = "B"}, [3] = {before = "B", after = "A"}}) == nil)
local protected = setmetatable({}, {})
assert(candidate({"A"}, protected) == nil)`,
    mutation: ['table.sort(ready)', 'table.sort(ready, function(a, b) return a > b end)'],
  },
  {
    id: 'crafting-batches', family: 'crafting-batches',
    prompt: 'Write a standalone Luau module returning craft(inventory, recipe, requested). inventory and recipe are plain maps from nonempty item IDs to finite nonnegative safe integers; recipe requirements must be positive. requested must be a finite nonnegative safe integer. Return the maximum batch count no greater than requested and a fresh remaining-inventory map, or nil for invalid input. Missing ingredients count as zero, and the input inventory must not change.',
    source: safeInteger + `return function(inventory, recipe, requested)
    if type(inventory) ~= "table" or getmetatable(inventory) ~= nil or type(recipe) ~= "table" or getmetatable(recipe) ~= nil or not integer(requested) or requested < 0 then return nil end
    for item, available in pairs(inventory) do
        if type(item) ~= "string" or item == "" or not integer(available) or available < 0 then return nil end
    end
    local batches = requested
    for item, need in pairs(recipe) do
        if type(item) ~= "string" or item == "" or not integer(need) or need <= 0 then return nil end
        local available = inventory[item] or 0
        if not integer(available) or available < 0 then return nil end
        batches = math.min(batches, math.floor(available / need))
    end
    local remaining = {}
    for item, available in pairs(inventory) do remaining[item] = available end
    for item, need in pairs(recipe) do remaining[item] = (remaining[item] or 0) - need * batches end
    return batches, remaining
end`,
    checks: `local inventory = {ore = 5, wood = 4, gem = 1}
local made, remaining = candidate(inventory, {ore = 2, wood = 3}, 5)
assert(made == 1 and remaining.ore == 3 and remaining.wood == 1 and remaining.gem == 1)
assert(inventory.ore == 5 and inventory.wood == 4)
local made2, remaining2 = candidate({ore = 10}, {ore = 2}, 3)
assert(made2 == 3 and remaining2.ore == 4)
local made3, remaining3 = candidate({ore = 1}, {ore = 2}, 1)
assert(made3 == 0 and remaining3.ore == 1)
local missingMade, missingRemaining = candidate({}, {ore = 2}, 3)
assert(missingMade == 0 and missingRemaining.ore == 0)
assert(candidate({ore = 1}, {ore = 0}, 1) == nil)
assert(candidate({ore = -1}, {ore = 1}, 1) == nil)
assert(candidate({ore = 1}, {ore = 1}, 1.5) == nil)
assert(candidate({ore = 1}, {ore = 1}, 0/0) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, {}, 1) == nil)`,
    mutation: ['math.floor(available / need)', 'math.ceil(available / need)'],
  },
  {
    id: 'seeded-shuffle', family: 'seeded-shuffle',
    prompt: 'Write a standalone Luau module returning shuffle(items, seed). items must be a plain array with no holes, and seed must be a finite nonnegative safe integer. Return a deterministic fresh permutation using modulus 2147483647, multiplier 48271, state = seed % modulus, and a descending Fisher-Yates loop whose index is (state % i) + 1. Preserve the input and use no randomness APIs, clocks, or services. Return nil for invalid input.',
    source: safeInteger + plainArray + `return function(items, seed)
    if not array(items) or not integer(seed) or seed < 0 then return nil end
    local output = {}
    for i = 1, #items do
        output[i] = items[i]
    end
    local modulus = 2147483647
    local state = seed % modulus
    for i = #output, 2, -1 do
        state = (state * 48271) % modulus
        local j = (state % i) + 1
        output[i], output[j] = output[j], output[i]
    end
    return output
end`,
    checks: `local input = {"a", "b", "c", "d"}
local result = candidate(input, 42)
assert(table.concat(result, ",") == "d,b,a,c")
assert(table.concat(input, ",") == "a,b,c,d" and result ~= input)
assert(table.concat(candidate(input, 42), ",") == "d,b,a,c")
assert(#candidate({}, 42) == 0)
assert(candidate(input, -1) == nil)
assert(candidate(input, 1.5) == nil)
assert(candidate(input, 0/0) == nil)
assert(candidate({[1] = "a", [3] = "c"}, 42) == nil)
assert(candidate({[1.5] = "a"}, 42) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, 42) == nil)`,
    mutation: ['local j = (state % i) + 1', 'local j = i'],
  },
  {
    id: 'turn-rotation', family: 'turn-rotation',
    prompt: 'Write a standalone Luau module returning nextActor(order, current, disabled). order must be a plain array of unique nonempty actor IDs, current must be an active ID in that order, and disabled must be a plain set whose listed values are exactly true. Scan circularly after current, never return current, skip disabled actors, and return the next active ID or nil when none exists. Do not mutate inputs or access services.',
    source: plainArray + `return function(order, current, disabled)
    if not array(order) or type(disabled) ~= "table" or getmetatable(disabled) ~= nil or type(current) ~= "string" then return nil end
    local index = nil
    local known = {}
    for i = 1, #order do
        local id = order[i]
        if type(id) ~= "string" or id == "" or known[id] then return nil end
        known[id] = true
        if id == current then index = i end
    end
    if index == nil or disabled[current] == true then return nil end
    for id, value in pairs(disabled) do
        if type(id) ~= "string" or not known[id] or value ~= true then return nil end
    end
    for offset = 1, #order - 1 do
        local i = ((index + offset - 1) % #order) + 1
        local id = order[i]
        if disabled[id] ~= true then return id end
    end
    return nil
end`,
    checks: `local order = {"A", "B", "C"}
assert(candidate(order, "A", {B = true}) == "C")
assert(candidate(order, "C", {B = true}) == "A")
assert(candidate(order, "A", {B = true, C = true}) == nil)
assert(candidate(order, "B", {B = true}) == nil)
assert(candidate({"A"}, "A", {}) == nil)
assert(candidate(order, "X", {}) == nil)
assert(candidate({"A", "A"}, "A", {}) == nil)
assert(candidate({[1] = "A", [3] = "B"}, "A", {}) == nil)
assert(candidate({[0] = "A"}, "A", {}) == nil)
assert(candidate({[1.5] = "A"}, "A", {}) == nil)
assert(candidate(order, "A", {B = 1}) == nil)
assert(candidate(order, "A", {X = true}) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, "A", {}) == nil)`,
    mutation: ['for offset = 1, #order - 1 do', 'for offset = 0, #order - 1 do'],
  },
  {
    id: 'damage-mitigation', family: 'damage-mitigation',
    prompt: 'Write a standalone Luau module returning damage(power, armor, multiplier, minimum). All four inputs must be finite nonnegative numbers; compute power times multiplier reduced by armor using raw * 100 / (100 + armor), round to the nearest integer, and apply the minimum damage floor. Return nil for invalid input or a non-finite intermediate. Do not access engine services or mutate state.',
    source: finiteNumber + `return function(power, armor, multiplier, minimum)
    if not finite(power) or not finite(armor) or not finite(multiplier) or not finite(minimum) or power < 0 or armor < 0 or multiplier < 0 or minimum < 0 then return nil end
    local raw = power * multiplier
    if not finite(raw) then return nil end
    local mitigated = raw * 100 / (100 + armor)
    if not finite(mitigated) then return nil end
    return math.max(minimum, math.floor(mitigated + 0.5))
end`,
    checks: `assert(candidate(100, 0, 1, 0) == 100)
assert(candidate(100, 100, 1, 0) == 50)
assert(candidate(3, 0, 1.5, 0) == 5)
assert(candidate(1, 100, 1, 5) == 5)
assert(candidate(0, 100, 1, 0) == 0)
assert(candidate(-1, 0, 1, 0) == nil)
assert(candidate(1, 0/0, 1, 0) == nil)
assert(candidate(1, 0, math.huge, 0) == nil)
assert(candidate("1", 0, 1, 0) == nil)`,
    mutation: ['local mitigated = raw * 100 / (100 + armor)', 'local mitigated = raw * 100 / armor'],
  },
  {
    id: 'route-cost', family: 'route-cost',
    prompt: 'Write a standalone Luau module returning cost(path, terrainCosts). path must be a plain nonempty array of nonempty string terrain IDs, and terrainCosts must be a plain map from those IDs to finite positive numbers. Return the finite sum of each terrain cost, or nil for invalid input, an unknown terrain, or a non-finite total. Do not mutate either table or access services.',
    source: finiteNumber + plainArray + `return function(path, terrainCosts)
    if not array(path) or #path == 0 or type(terrainCosts) ~= "table" or getmetatable(terrainCosts) ~= nil then return nil end
    local total = 0
    for i = 1, #path do
        local terrain = path[i]
        if type(terrain) ~= "string" or terrain == "" then return nil end
        local value = terrainCosts[terrain]
        if not finite(value) or value <= 0 then return nil end
        total += value
        if not finite(total) then return nil end
    end
    return total
end`,
    checks: `local path = {"grass", "mud", "grass", "stone"}
local costs = {grass = 1, mud = 2.5, stone = 4}
assert(candidate(path, costs) == 8.5)
assert(path[1] == "grass" and costs.grass == 1)
assert(candidate({"grass", "lava"}, costs) == nil)
assert(candidate({"grass"}, {grass = 0}) == nil)
assert(candidate({"grass"}, {grass = math.huge}) == nil)
assert(candidate({"huge", "huge"}, {huge = 9e307}) == nil)
assert(candidate({}, costs) == nil)
assert(candidate({""}, costs) == nil)
assert(candidate({"grass"}, nil) == nil)
assert(candidate({[1] = "grass", [3] = "stone"}, costs) == nil)
assert(candidate({[1.5] = "grass"}, costs) == nil)
local protected = setmetatable({}, {})
assert(candidate(protected, costs) == nil)`,
    mutation: ['total += value', 'total = value'],
  },
  {
    id: 'team-balance', family: 'team-balance',
    prompt: 'Write a standalone Luau module returning chooseTeam(loads, capacity). loads must be a plain nonempty array of finite nonnegative safe integers no greater than capacity, and capacity must be a positive safe integer. Return the lowest-index team with the smallest load among teams below capacity, or nil if invalid or all teams are full. Do not mutate the array or use services.',
    source: safeInteger + plainArray + `return function(loads, capacity)
    if not array(loads) or #loads == 0 or not integer(capacity) or capacity <= 0 then return nil end
    local chosen = nil
    for i = 1, #loads do
        local load = loads[i]
        if not integer(load) or load < 0 or load > capacity then return nil end
        if load < capacity and (chosen == nil or load < loads[chosen]) then chosen = i end
    end
    return chosen
end`,
    checks: `assert(candidate({3, 1, 2}, 4) == 2)
assert(candidate({1, 1, 3}, 4) == 1)
assert(candidate({4, 4}, 4) == nil)
assert(candidate({0, 2}, 4) == 1)
assert(candidate({5, 1}, 4) == nil)
assert(candidate({-1, 1}, 4) == nil)
assert(candidate({1.5, 1}, 4) == nil)
assert(candidate({1, 1}, 0) == nil)
assert(candidate({}, 4) == nil)
assert(candidate({1, math.huge}, 4) == nil)
assert(candidate({[1] = 1, [3] = 2}, 4) == nil)
assert(candidate({[1.5] = 1}, 4) == nil)
local input = {2, 3}
candidate(input, 4)
assert(input[1] == 2 and input[2] == 3)`,
    mutation: ['load < loads[chosen]', 'load <= loads[chosen]'],
  },
];
