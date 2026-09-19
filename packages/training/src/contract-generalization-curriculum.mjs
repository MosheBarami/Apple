/**
 * Small contract-generalization extension for the bounded local MAX experiment.
 *
 * The two training families teach abstract obligations observed in the failed pilots without
 * copying either held-out algorithm. The two transfer families remain test-only when v4 is built.
 * Every item is first-party, engine-independent Luau with executable reference and mutation proof.
 */

const finiteNumber = `local function finite(value)
    return type(value) == "number" and value == value and math.abs(value) < math.huge
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

export const CONTRACT_GENERALIZATION_SPLITS = Object.freeze({
  'half-open-time-window': 'train',
  'dense-sample-mean': 'train',
  'fractional-band-classification': 'test',
  'dense-filter-preservation': 'test',
});

export const CONTRACT_GENERALIZATION_CURRICULUM = [
  {
    id: 'session-window', family: 'half-open-time-window',
    prompt: 'Write a standalone Luau module returning active(now, startsAt, duration). All inputs must be finite nonnegative numbers and duration must be positive; fractional values are valid. Return nil for invalid input or a non-finite finish. Otherwise return whether now lies in the half-open interval [startsAt, startsAt + duration). Do not read a clock, mutate state, or access Roblox services.',
    source: finiteNumber + `return function(now, startsAt, duration)
    if not finite(now) or not finite(startsAt) or not finite(duration) or now < 0 or startsAt < 0 or duration <= 0 then return nil end
    local finish = startsAt + duration
    if not finite(finish) then return nil end
    return now >= startsAt and now < finish
end`,
    checks: `assert(candidate(10, 10, 2) == true)
assert(candidate(11.999, 10, 2) == true)
assert(candidate(12, 10, 2) == false)
assert(candidate(9.999, 10, 2) == false)
assert(candidate(0.25, 0.25, 0.5) == true)
assert(candidate(0.75, 0.25, 0.5) == false)
assert(candidate(0, 0, 0) == nil)
assert(candidate(-0.1, 0, 1) == nil)
assert(candidate(0, -0.1, 1) == nil)
assert(candidate(0, 0, math.huge) == nil)
assert(candidate(0/0, 0, 1) == nil)
assert(candidate("0", 0, 1) == nil)
assert(candidate(9e307, 9e307, 9e307) == nil)`,
    mutation: ['now < finish', 'now <= finish'],
  },
  {
    id: 'dense-sample-mean', family: 'dense-sample-mean',
    prompt: 'Write a standalone Luau module returning mean(samples). samples must be a plain nonempty dense array with no metatable or extra keys. Every element must be a finite number; negative and fractional values are valid, and the running total must remain finite. Return the arithmetic mean or nil for invalid input. Do not mutate the array or use services.',
    source: finiteNumber + plainArray + `return function(samples)
    if not array(samples) or #samples == 0 then return nil end
    local total = 0
    for i = 1, #samples do
        local value = samples[i]
        if not finite(value) then return nil end
        total += value
        if not finite(total) then return nil end
    end
    return total / #samples
end`,
    checks: `local function near(a, b) return math.abs(a - b) < 1e-9 end
local input = {0.5, 1.5, 4}
assert(near(candidate(input), 2))
assert(input[1] == 0.5 and input[2] == 1.5 and input[3] == 4)
assert(near(candidate({-2.5, 2.5}), 0))
assert(candidate({}) == nil)
assert(candidate({1, 0/0}) == nil)
assert(candidate({1, math.huge}) == nil)
assert(candidate({9e307, 9e307}) == nil)
assert(candidate({[1] = 1, [3] = 3}) == nil)
assert(candidate({[0] = 1}) == nil)
assert(candidate({[1.5] = 1}) == nil)
assert(candidate({1, 2, extra = 3}) == nil)
assert(candidate(setmetatable({1, 3}, {})) == nil)
assert(candidate("1,2") == nil)`,
    mutation: ['if not array(samples) or #samples == 0', 'if type(samples) ~= "table" or #samples == 0'],
  },
  {
    id: 'meter-band', family: 'fractional-band-classification',
    prompt: 'Write a standalone Luau module returning band(value, low, high). All inputs must be finite numbers and low must be strictly less than high; fractional and negative values are valid. Return "low" when value < low, "middle" when low <= value < high, and "high" when value >= high. Return nil for invalid input. Do not mutate state or access services.',
    source: finiteNumber + `return function(value, low, high)
    if not finite(value) or not finite(low) or not finite(high) or low >= high then return nil end
    if value < low then return "low" end
    if value < high then return "middle" end
    return "high"
end`,
    checks: `assert(candidate(-2, -1, 1) == "low")
assert(candidate(-1, -1, 1) == "middle")
assert(candidate(0.25, -1, 1) == "middle")
assert(candidate(0.999, -1, 1) == "middle")
assert(candidate(1, -1, 1) == "high")
assert(candidate(1.5, -1, 1) == "high")
assert(candidate(0, 1, 1) == nil)
assert(candidate(0, 2, 1) == nil)
assert(candidate(0/0, -1, 1) == nil)
assert(candidate(0, -1, math.huge) == nil)
assert(candidate("0", -1, 1) == nil)`,
    mutation: ['if value < high then return "middle" end', 'if value <= high then return "middle" end'],
  },
  {
    id: 'compact-under-ceiling', family: 'dense-filter-preservation',
    prompt: 'Write a standalone Luau module returning compact(values, ceiling). values must be a plain dense array with no metatable or extra keys, and every value and ceiling must be a finite nonnegative number; fractional values are valid. Return a fresh array preserving the order of values less than or equal to ceiling. Return nil for invalid input, and an empty array when no value qualifies. Do not mutate the input or use services.',
    source: finiteNumber + plainArray + `return function(values, ceiling)
    if not array(values) or not finite(ceiling) or ceiling < 0 then return nil end
    local result = {}
    for i = 1, #values do
        local value = values[i]
        if not finite(value) or value < 0 then return nil end
        if value <= ceiling then table.insert(result, value) end
    end
    return result
end`,
    checks: `local input = {2.5, 1, 3, 2.5, 0}
local result = candidate(input, 2.5)
assert(#result == 4 and result[1] == 2.5 and result[2] == 1 and result[3] == 2.5 and result[4] == 0)
assert(result ~= input and #input == 5 and input[3] == 3)
assert(#candidate({4, 5}, 3) == 0)
assert(#candidate({}, 3) == 0)
assert(candidate({1, -1}, 3) == nil)
assert(candidate({1, 0/0}, 3) == nil)
assert(candidate({1, math.huge}, 3) == nil)
assert(candidate({1}, -1) == nil)
assert(candidate({1}, math.huge) == nil)
assert(candidate({[1] = 1, [3] = 2}, 3) == nil)
assert(candidate({1, 2, extra = 3}, 3) == nil)
assert(candidate(setmetatable({1, 2}, {}), 3) == nil)`,
    mutation: ['if value <= ceiling then table.insert(result, value) end', 'if value < ceiling then table.insert(result, value) end'],
  },
];
