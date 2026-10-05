/** First-party, engine-independent seeds. These are not recorded Studio trajectories. */
const finiteInteger = `local function integer(value)
    return type(value) == "number" and value == value and math.abs(value) < math.huge and value % 1 == 0 and math.abs(value) <= 9007199254740991
end
`;

export const GAME_LOGIC_CURRICULUM = [
  {
    id: 'purchase-transaction', family: 'economy-transaction',
    prompt: 'Write a standalone Luau module returning purchase(balance, price, owned). Both amounts must be finite nonnegative safe integers, price must be positive, and owned must be a boolean. Return the unchanged balance and false for invalid input, an already owned item, or insufficient funds; otherwise return the deducted balance and true. This is pure server-side business logic, not a RemoteEvent handler or persistent save.',
    source: finiteInteger + `return function(balance, price, owned)
    if not integer(balance) or balance < 0 or not integer(price) or price <= 0 or type(owned) ~= "boolean" then return balance, false end
    if owned or balance < price then return balance, false end
    return balance - price, true
end`,
    checks: `for balance = 0, 40 do
    for price = 1, 15 do
        local result, ok = candidate(balance, price, false)
        assert(ok == (balance >= price))
        assert(result == (if balance >= price then balance - price else balance))
        local unchanged, refused = candidate(balance, price, true)
        assert(unchanged == balance and refused == false)
    end
end
for _, price in {0, -1, 1.5, math.huge, "10"} do local b, ok = candidate(20, price, false); assert(b == 20 and not ok) end
local b, ok = candidate(20, 0/0, false); assert(b == 20 and not ok)
local b2, ok2 = candidate(20, 10, "false"); assert(b2 == 20 and not ok2)
local b3, ok3 = candidate(20, 10, nil); assert(b3 == 20 and not ok3)`,
    mutation: ['if owned or balance < price', 'if balance < price'],
  },
  {
    id: 'bounded-reward', family: 'bounded-reward',
    prompt: 'Write a standalone Luau module returning award(balance, reward, cap). Accept only finite nonnegative safe integers with balance <= cap. Return nil on invalid inputs. Otherwise return balance plus reward capped at cap, without overflowing the safe-integer range in an intermediate addition. No external state or Roblox services.',
    source: finiteInteger + `return function(balance, reward, cap)
    if not integer(balance) or not integer(reward) or not integer(cap) or balance < 0 or reward < 0 or cap < balance then return nil end
    return balance + math.min(reward, cap - balance)
end`,
    checks: `for cap = 0, 30 do for balance = 0, cap do for reward = 0, 35 do
    local expected = math.min(balance + reward, cap)
    assert(candidate(balance, reward, cap) == expected)
end end end
assert(candidate(9007199254740990, 9007199254740991, 9007199254740991) == 9007199254740991)
assert(candidate(5, 1, 4) == nil)
assert(candidate(-1, 1, 10) == nil)
assert(candidate(1, 0/0, 10) == nil)
assert(candidate(1, math.huge, 10) == nil)
assert(candidate("1", 1, 10) == nil)`,
    mutation: ['math.min(reward, cap - balance)', 'reward'],
  },
  {
    id: 'cooldown-clock', family: 'cooldown-clock',
    prompt: 'Write a standalone Luau module returning ready(now, previous, delay). Times and delay must be finite nonnegative numbers. previous may be nil, meaning no previous use. Return false for invalid input or a clock earlier than previous. Otherwise allow use exactly when elapsed time is at least delay. Do not read a clock or mutate state.',
    source: `local function valid(v)
    return type(v) == "number" and v == v and v >= 0 and v < math.huge
end
return function(now, previous, delay)
    if not valid(now) or not valid(delay) then return false end
    if previous == nil then return true end
    if not valid(previous) or now < previous then return false end
    return now - previous >= delay
end`,
    checks: `assert(candidate(5, nil, 3))
assert(candidate(5, 2, 3))
assert(not candidate(4.999, 2, 3))
assert(not candidate(1, 2, 0))
assert(candidate(2, 2, 0))
for _, bad in {-1, math.huge, "2"} do
    assert(not candidate(bad, nil, 3)); assert(not candidate(5, bad, 3)); assert(not candidate(5, nil, bad))
end
assert(not candidate(0/0, nil, 3))`,
    mutation: ['now - previous >= delay', 'now - previous > delay'],
  },
  {
    id: 'ordered-checkpoints', family: 'ordered-checkpoints',
    prompt: 'Write a standalone Luau module returning advance(current, touched, total). All arguments must be finite safe integers, total positive, current in 0..total and touched in 1..total. Return nil for invalid input. Advance only to the immediately next checkpoint; duplicate, earlier and skipped checkpoints leave current unchanged. Do not teleport or save anything.',
    source: finiteInteger + `return function(current, touched, total)
    if not integer(current) or not integer(touched) or not integer(total) or total < 1 or current < 0 or current > total or touched < 1 or touched > total then return nil end
    return if touched == current + 1 then touched else current
end`,
    checks: `for total = 1, 12 do for current = 0, total do for touched = 1, total do
    assert(candidate(current, touched, total) == (if touched - current == 1 then touched else current))
end end end
assert(candidate(0, 0, 4) == nil)
assert(candidate(5, 1, 4) == nil)
assert(candidate(0, 1, math.huge) == nil)
assert(candidate(0, 1.5, 4) == nil)`,
    mutation: ['touched == current + 1', 'touched > current'],
  },
  {
    id: 'inventory-capacity', family: 'inventory-capacity',
    prompt: 'Write a standalone Luau module returning fit(count, incoming, capacity). All values must be finite nonnegative safe integers and count cannot exceed capacity. Invalid input returns nil. Valid input returns two numbers: the resulting count and the rejected incoming amount. Fill available capacity without losing or creating items and without unsafe intermediate addition. No mutation or external dependencies.',
    source: finiteInteger + `return function(count, incoming, capacity)
    if not integer(count) or not integer(incoming) or not integer(capacity) or count < 0 or incoming < 0 or capacity < count then return nil end
    local accepted = math.min(incoming, capacity - count)
    return count + accepted, incoming - accepted
end`,
    checks: `for capacity = 0, 20 do for count = 0, capacity do for incoming = 0, 25 do
    local result, rejected = candidate(count, incoming, capacity)
    assert(result <= capacity and result >= count and rejected >= 0)
    assert(result - count + rejected == incoming)
    assert(rejected == 0 or result == capacity)
end end end
assert(candidate(4, 2, 3) == nil)
assert(candidate(0, -1, 3) == nil)
assert(candidate(0, "1", 3) == nil)
local n, r = candidate(9007199254740990, 9007199254740991, 9007199254740991)
assert(n == 9007199254740991 and r == 9007199254740990)`,
    mutation: ['incoming - accepted', 'incoming'],
  },
  {
    id: 'round-transitions', family: 'round-transitions',
    prompt: 'Write a standalone Luau module returning transition(state, event). Valid transitions: waiting + enoughPlayers -> countdown; countdown + elapsed -> playing; countdown + tooFewPlayers -> waiting; playing + finished -> results; results + elapsed -> waiting. Any other combination of strings returns the unchanged state. Non-string arguments return nil. Do not start timers or access services.',
    source: `local transitions = {
    waiting = { enoughPlayers = "countdown" },
    countdown = { elapsed = "playing", tooFewPlayers = "waiting" },
    playing = { finished = "results" },
    results = { elapsed = "waiting" },
}
return function(state, event)
    if type(state) ~= "string" or type(event) ~= "string" then return nil end
    local choices = transitions[state]
    return if choices and choices[event] then choices[event] else state
end`,
    checks: `assert(candidate("waiting", "enoughPlayers") == "countdown")
assert(candidate("countdown", "elapsed") == "playing")
assert(candidate("countdown", "tooFewPlayers") == "waiting")
assert(candidate("playing", "finished") == "results")
assert(candidate("results", "elapsed") == "waiting")
assert(candidate("playing", "elapsed") == "playing")
assert(candidate("custom", "elapsed") == "custom")
assert(candidate(nil, "elapsed") == nil)
assert(candidate("waiting", {}) == nil)`,
    mutation: ['choices[event] else state', 'choices[event] else nil'],
  },
  {
    id: 'level-from-xp', family: 'level-from-xp',
    prompt: 'Write a standalone Luau module returning level(xp, step, maximum). xp is a finite nonnegative safe integer; step and maximum are finite positive safe integers. Return nil for invalid input. Every step XP adds one level starting at level 1; cap the result at maximum. Do not loop once per XP point or add beyond the safe-integer limit.',
    source: finiteInteger + `return function(xp, step, maximum)
    if not integer(xp) or not integer(step) or not integer(maximum) or xp < 0 or step <= 0 or maximum < 1 then return nil end
    return math.min(math.floor(xp / step), maximum - 1) + 1
end`,
    checks: `for step = 1, 12 do for xp = 0, 100 do for maximum = 1, 15 do
    local expected = 1
    while expected < maximum and xp >= expected * step do expected += 1 end
    assert(candidate(xp, step, maximum) == expected)
end end end
assert(candidate(1, 0, 2) == nil)
assert(candidate(1, 2, 0) == nil)
assert(candidate(1.5, 2, 5) == nil)
assert(candidate(9007199254740991, 1, 9007199254740991) == 9007199254740991)`,
    mutation: ['maximum - 1) + 1', 'maximum - 1)'],
  },
  {
    id: 'unlock-prerequisites', family: 'unlock-prerequisites',
    prompt: 'Write a standalone Luau module returning unlocked(required, completed). required is an array of prerequisite string IDs and completed is a set table whose satisfied entries are exactly true. Both tables must have no metatable; otherwise return false. Every required ID must be a nonempty string mapped to true, not merely a truthy value. An empty requirement array passes. Non-table arguments fail. Inputs are trusted array/set shapes, but their values still need validation. No mutation or external services.',
    source: `return function(required, completed)
    if type(required) ~= "table" or type(completed) ~= "table" or getmetatable(required) ~= nil or getmetatable(completed) ~= nil then return false end
    for _, id in ipairs(required) do
        if type(id) ~= "string" or id == "" or completed[id] ~= true then return false end
    end
    return true
end`,
    checks: `assert(candidate({}, {}))
assert(candidate({"intro", "gate"}, {intro = true, gate = true}))
assert(not candidate({"intro", "gate"}, {intro = true}))
assert(not candidate({"intro"}, {intro = 1}))
assert(not candidate({""}, {[""] = true}))
assert(not candidate({5}, {[5] = true}))
assert(not candidate(nil, {}))
assert(not candidate({"gate"}, setmetatable({}, {__index = function() return true end})))`,
    mutation: ['completed[id] ~= true', 'not completed[id]'],
  },
  {
    id: 'finite-normalization', family: 'finite-normalization',
    prompt: 'Write a standalone Luau module returning fraction(value, maximum). Both arguments must be finite numbers and maximum strictly positive, otherwise return nil. Clamp the ratio to [0,1]. Negative value maps to zero and value greater than maximum maps to one. Avoid division when already at or beyond either bound. Do not mutate GUI objects.',
    source: `return function(value, maximum)
    if type(value) ~= "number" or type(maximum) ~= "number" or value ~= value or maximum ~= maximum or math.abs(value) == math.huge or maximum <= 0 or maximum == math.huge then return nil end
    if value <= 0 then return 0 end
    if value >= maximum then return 1 end
    return value / maximum
end`,
    checks: `assert(candidate(5, 10) == 0.5)
assert(candidate(-5, 10) == 0)
assert(candidate(15, 10) == 1)
assert(candidate(0, 10) == 0)
assert(candidate(10, 10) == 1)
assert(candidate(1, 0) == nil)
assert(candidate(0/0, 10) == nil)
assert(candidate(1, math.huge) == nil)
assert(candidate(-math.huge, 10) == nil)
assert(candidate("5", 10) == nil)`,
    mutation: ['if value >= maximum then return 1 end', 'if value >= maximum then return value end'],
  },
  {
    id: 'stable-leaderboard', family: 'stable-leaderboard',
    prompt: 'Write a standalone Luau module returning rank(rows). Input is a trusted array of records {userId = string, score = finite number}. Return a new array of fresh records ordered by descending score, then lexicographically ascending userId for ties. Preserve the original array and records, drop all fields other than userId and score, and use no services.',
    source: `return function(rows)
    local result = {}
    for _, row in ipairs(rows) do
        table.insert(result, {userId = row.userId, score = row.score})
    end
    table.sort(result, function(a, b)
        if a.score == b.score then return a.userId < b.userId end
        return a.score > b.score
    end)
    return result
end`,
    checks: `local input = {{userId = "c", score = 3, private = "omit"}, {userId = "b", score = 8}, {userId = "a", score = 8}}
local result = candidate(input)
assert(#result == 3 and result[1].userId == "a" and result[2].userId == "b" and result[3].userId == "c")
assert(input[1].userId == "c" and result ~= input and result[3] ~= input[1])
assert(result[3].private == nil)
result[3].score = 500
assert(input[1].score == 3)
assert(#candidate({}) == 0)`,
    mutation: ['a.score > b.score', 'a.score < b.score'],
  },
];
