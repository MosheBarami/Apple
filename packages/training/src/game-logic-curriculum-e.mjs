/**
 * Curriculum E: interface logic, client/server contracts and data shaping.
 *
 * First-party, engine-independent Luau. Every answer is executed by the local `luau` binary and
 * every answer carries a one-site behavioural mutation that an assertion must reject, so a green
 * run is a falsification attempt that failed rather than an unchecked claim.
 *
 * The lane here is deliberately narrow and disjoint from the gameplay families: formatting numbers
 * and durations for a display, laying out and clamping rectangles, paginating and filtering lists,
 * merging and projecting records, and refusing a payload whose shape the server has not verified.
 * A UDim2 is modelled as plain numbers; nothing in this file touches a Roblox datatype or service.
 */

const finiteNumber = `local function finite(value)
    return type(value) == "number" and value == value and math.abs(value) < math.huge
end
`;

const safeInteger = `local function integerValue(value)
    return type(value) == "number" and value == value and math.abs(value) < math.huge
        and value % 1 == 0 and math.abs(value) <= 9007199254740991
end
`;

const denseArray = `local function denseArray(value)
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

export const GAME_LOGIC_CURRICULUM_E = [
  {
    id: 'abbreviate-counter', family: 'ui-count-abbreviation',
    prompt: 'Write a standalone Luau module returning abbreviate(value). value must be a finite safe integer in [0, 999999999999999]; anything else returns nil. Below 1000 return the plain decimal digits. Otherwise scale by the largest of 1000 (K), 1000000 (M), 1000000000 (B) or 1000000000000 (T) that does not exceed the value, TRUNCATE towards zero to one decimal place rather than rounding, and drop a trailing ".0": 1000 is "1K", 1199 is "1.1K", 999999 is "999.9K", 1000000 is "1M". This is pure display formatting, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `local units = {
    { 1000000000000, "T" },
    { 1000000000, "B" },
    { 1000000, "M" },
    { 1000, "K" },
}
return function(value)
    if not integerValue(value) or value < 0 or value > 999999999999999 then return nil end
    for _, unit in ipairs(units) do
        local step, suffix = unit[1], unit[2]
        if value >= step then
            local whole = math.floor(value / step)
            local tenth = math.floor((value % step) * 10 / step)
            if tenth == 0 then return string.format("%d%s", whole, suffix) end
            return string.format("%d.%d%s", whole, tenth, suffix)
        end
    end
    return string.format("%d", value)
end`,
    checks: `assert(candidate(0) == "0")
assert(candidate(999) == "999")
assert(candidate(1000) == "1K")
assert(candidate(1049) == "1K")
assert(candidate(1050) == "1K")
assert(candidate(1100) == "1.1K")
assert(candidate(1199) == "1.1K")
assert(candidate(9999) == "9.9K")
assert(candidate(999999) == "999.9K")
assert(candidate(1000000) == "1M")
assert(candidate(1234567) == "1.2M")
assert(candidate(999999999) == "999.9M")
assert(candidate(1000000000) == "1B")
assert(candidate(1999999999) == "1.9B")
assert(candidate(1000000000000) == "1T")
assert(candidate(999999999999999) == "999.9T")
for value = 0, 999 do assert(candidate(value) == tostring(value)) end
for value = 1000, 1999 do
    local tenth = math.floor(value / 100) % 10
    assert(candidate(value) == (if tenth == 0 then "1K" else "1." .. tenth .. "K"))
end
for value = 999990, 1000010 do
    local text = candidate(value)
    assert(text == (if value < 1000000 then "999.9K" else "1M"))
end
assert(candidate(1000000000000000) == nil)
assert(candidate(-1) == nil)
assert(candidate(1.5) == nil)
assert(candidate(math.huge) == nil)
assert(candidate(0/0) == nil)
assert(candidate("1000") == nil)
assert(candidate(nil) == nil)`,
    mutation: ['if value >= step then', 'if value > step then'],
  },
  {
    id: 'format-duration', family: 'ui-duration-format',
    prompt: 'Write a standalone Luau module returning formatDuration(seconds). seconds must be a finite safe integer in [0, 359999]; anything else returns nil. Under one hour return "mm:ss" with both fields zero-padded to two digits. From one hour return "h:mm:ss" with the hour unpadded and the minute and second fields zero-padded, so 3599 is "59:59" and 3600 is "1:00:00". This is pure display formatting, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `return function(seconds)
    if not integerValue(seconds) or seconds < 0 or seconds > 359999 then return nil end
    local second = seconds % 60
    local totalMinutes = (seconds - second) / 60
    local minute = totalMinutes % 60
    local hour = (totalMinutes - minute) / 60
    if hour == 0 then return string.format("%02d:%02d", minute, second) end
    return string.format("%d:%02d:%02d", hour, minute, second)
end`,
    checks: `assert(candidate(0) == "00:00")
assert(candidate(9) == "00:09")
assert(candidate(59) == "00:59")
assert(candidate(60) == "01:00")
assert(candidate(599) == "09:59")
assert(candidate(600) == "10:00")
assert(candidate(3599) == "59:59")
assert(candidate(3600) == "1:00:00")
assert(candidate(3601) == "1:00:01")
assert(candidate(3661) == "1:01:01")
assert(candidate(35999) == "9:59:59")
assert(candidate(36000) == "10:00:00")
assert(candidate(359999) == "99:59:59")
for seconds = 0, 3599 do
    local text = candidate(seconds)
    assert(#text == 5 and string.sub(text, 3, 3) == ":")
    assert(tonumber(string.sub(text, 1, 2)) * 60 + tonumber(string.sub(text, 4, 5)) == seconds)
end
for seconds = 3600, 3700 do
    local text = candidate(seconds)
    assert(#text == 7 and string.sub(text, 1, 2) == "1:")
    assert(tonumber(string.sub(text, 3, 4)) * 60 + tonumber(string.sub(text, 6, 7)) == seconds - 3600)
end
assert(candidate(360000) == nil)
assert(candidate(-1) == nil)
assert(candidate(1.5) == nil)
assert(candidate(math.huge) == nil)
assert(candidate(0/0) == nil)
assert(candidate("60") == nil)
assert(candidate(nil) == nil)`,
    mutation: ['if hour == 0 then', 'if hour <= 1 then'],
  },
  {
    id: 'ordinal-suffix', family: 'ui-ordinal-suffix',
    prompt: 'Write a standalone Luau module returning ordinal(place). place must be a finite safe integer in [1, 999999999]; anything else returns nil. Return the digits followed by the English ordinal suffix: "st" for a final digit of 1, "nd" for 2 and "rd" for 3, except that any number whose last two digits are 11, 12 or 13 takes "th", so 11 is "11th", 21 is "21st" and 113 is "113th". This is pure display formatting, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `return function(place)
    if not integerValue(place) or place < 1 or place > 999999999 then return nil end
    local lastTwo = place % 100
    if lastTwo >= 11 and lastTwo <= 13 then return place .. "th" end
    local last = place % 10
    if last == 1 then return place .. "st" end
    if last == 2 then return place .. "nd" end
    if last == 3 then return place .. "rd" end
    return place .. "th"
end`,
    checks: `assert(candidate(1) == "1st")
assert(candidate(2) == "2nd")
assert(candidate(3) == "3rd")
assert(candidate(4) == "4th")
assert(candidate(10) == "10th")
assert(candidate(11) == "11th")
assert(candidate(12) == "12th")
assert(candidate(13) == "13th")
assert(candidate(14) == "14th")
assert(candidate(21) == "21st")
assert(candidate(22) == "22nd")
assert(candidate(23) == "23rd")
assert(candidate(101) == "101st")
assert(candidate(111) == "111th")
assert(candidate(112) == "112th")
assert(candidate(113) == "113th")
assert(candidate(121) == "121st")
assert(candidate(999999999) == "999999999th")
for place = 1, 1000 do
    local text = candidate(place)
    assert(string.sub(text, 1, #text - 2) == tostring(place))
    local expected = "th"
    local lastTwo = place % 100
    if lastTwo < 11 or lastTwo > 13 then
        local last = place % 10
        if last == 1 then expected = "st" elseif last == 2 then expected = "nd" elseif last == 3 then expected = "rd" end
    end
    assert(string.sub(text, -2) == expected)
end
assert(candidate(0) == nil)
assert(candidate(-1) == nil)
assert(candidate(1.5) == nil)
assert(candidate(1000000000) == nil)
assert(candidate(math.huge) == nil)
assert(candidate(0/0) == nil)
assert(candidate("1") == nil)
assert(candidate(nil) == nil)`,
    mutation: ['lastTwo >= 11 and lastTwo <= 13', 'lastTwo >= 11 and lastTwo < 13'],
  },
  {
    id: 'truncate-display-name', family: 'ui-name-truncation',
    prompt: 'Write a standalone Luau module returning truncate(text, budget). text must be a string of at most 256 bytes containing only printable ASCII (space through tilde), and budget must be a finite safe integer in [4, 256]; anything else returns nil. Return text unchanged when it already fits the budget, otherwise return exactly budget characters: the first budget minus three characters followed by three dots. This is pure display formatting, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `return function(text, budget)
    if type(text) ~= "string" or #text > 256 or string.find(text, "[^ -~]") then return nil end
    if not integerValue(budget) or budget < 4 or budget > 256 then return nil end
    if #text <= budget then return text end
    return string.sub(text, 1, budget - 3) .. "..."
end`,
    checks: `assert(candidate("", 4) == "")
assert(candidate("abcd", 4) == "abcd")
assert(candidate("abcde", 4) == "a...")
assert(candidate("Apple Builder", 13) == "Apple Builder")
assert(candidate("Apple Builder", 12) == "Apple Bui...")
assert(candidate("Apple Builder", 4) == "A...")
for budget = 4, 20 do
    for length = 0, 24 do
        local source = string.rep("a", length)
        local result = candidate(source, budget)
        if length <= budget then
            assert(result == source)
        else
            assert(#result == budget)
            assert(string.sub(result, -3) == "...")
            assert(string.sub(result, 1, budget - 3) == string.rep("a", budget - 3))
        end
    end
end
assert(candidate("abcdef", 3) == nil)
assert(candidate("abcdef", 257) == nil)
assert(candidate("abcdef", 4.5) == nil)
assert(candidate("abcdef", math.huge) == nil)
assert(candidate("abcdef", 0/0) == nil)
assert(candidate(string.rep("a", 257), 8) == nil)
assert(candidate("tab" .. string.char(9) .. "here", 8) == nil)
assert(candidate(123, 8) == nil)
assert(candidate(nil, 8) == nil)
assert(candidate("abcdef", "8") == nil)`,
    mutation: ['if #text <= budget then return text end', 'if #text < budget then return text end'],
  },
  {
    id: 'wrap-label-text', family: 'ui-text-wrap',
    prompt: 'Write a standalone Luau module returning wrap(text, width). text must be a string of at most 512 bytes containing only printable ASCII (space through tilde), and width must be a finite safe integer in [1, 200]; anything else returns nil. Split on runs of spaces and greedily pack words into lines of at most width characters, counting the single separating space, hard-splitting any word longer than width. Return a fresh array of nonempty lines with no leading or trailing spaces; text with no words returns an empty array. This is pure layout logic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `return function(text, width)
    if type(text) ~= "string" or #text > 512 or string.find(text, "[^ -~]") then return nil end
    if not integerValue(width) or width < 1 or width > 200 then return nil end
    local lines = {}
    local current = ""
    local function flush()
        if current ~= "" then
            table.insert(lines, current)
            current = ""
        end
    end
    for word in string.gmatch(text, "%S+") do
        while #word > width do
            flush()
            table.insert(lines, string.sub(word, 1, width))
            word = string.sub(word, width + 1)
        end
        if current == "" then
            current = word
        elseif #current + 1 + #word <= width then
            current = current .. " " .. word
        else
            flush()
            current = word
        end
    end
    flush()
    return lines
end`,
    checks: `local function join(lines) return table.concat(lines, "|") end
assert(join(candidate("hello world", 5)) == "hello|world")
assert(join(candidate("hello world", 10)) == "hello|world")
assert(join(candidate("hello world", 11)) == "hello world")
assert(join(candidate("hello world", 12)) == "hello world")
assert(join(candidate("abcdefghij", 4)) == "abcd|efgh|ij")
assert(join(candidate("abcdefgh", 4)) == "abcd|efgh")
assert(join(candidate("a b c", 1)) == "a|b|c")
assert(join(candidate("aa b", 2)) == "aa|b")
assert(join(candidate("a bb ccc", 6)) == "a bb|ccc")
assert(join(candidate("a    b", 5)) == "a b")
assert(#candidate("", 5) == 0)
assert(#candidate("     ", 5) == 0)
local sentence = "ab cde f gh ijk l mn"
for width = 3, 20 do
    local lines = candidate(sentence, width)
    assert(table.concat(lines, " ") == sentence)
    for i = 1, #lines do
        assert(lines[i] ~= "" and #lines[i] <= width)
        assert(string.sub(lines[i], 1, 1) ~= " " and string.sub(lines[i], -1) ~= " ")
    end
    for i = 1, #lines - 1 do
        local nextWord = string.match(lines[i + 1], "^%S+")
        assert(#lines[i] + 1 + #nextWord > width)
    end
end
assert(candidate("hi", 0) == nil)
assert(candidate("hi", 201) == nil)
assert(candidate("hi", 2.5) == nil)
assert(candidate("hi", math.huge) == nil)
assert(candidate("hi", 0/0) == nil)
assert(candidate(string.rep("a", 513), 5) == nil)
assert(candidate("line" .. string.char(10) .. "break", 5) == nil)
assert(candidate(7, 5) == nil)
assert(candidate(nil, 5) == nil)`,
    mutation: ['#current + 1 + #word <= width', '#current + #word <= width'],
  },
  {
    id: 'paginate-list', family: 'ui-pagination',
    prompt: 'Write a standalone Luau module returning page(total, pageSize, index). total must be a finite safe integer in [0, 1000000], pageSize a finite safe integer in [1, 1000000] and index a finite safe integer of at least 1; anything else returns nil. The page count is the number of whole pages needed, but never less than one, so an empty list still has a single page. Return nil for an index past the last page; otherwise return the first index, the last index and the page count, where an empty page reports first 1 and last 0. This is pure list arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `return function(total, pageSize, index)
    if not integerValue(total) or total < 0 or total > 1000000 then return nil end
    if not integerValue(pageSize) or pageSize < 1 or pageSize > 1000000 then return nil end
    if not integerValue(index) or index < 1 then return nil end
    local pageCount = math.max(1, math.ceil(total / pageSize))
    if index > pageCount then return nil end
    local first = (index - 1) * pageSize + 1
    return first, math.min(first + pageSize - 1, total), pageCount
end`,
    checks: `local first, last, pages = candidate(0, 10, 1)
assert(first == 1 and last == 0 and pages == 1)
assert(candidate(0, 10, 2) == nil)
first, last, pages = candidate(10, 10, 1)
assert(first == 1 and last == 10 and pages == 1)
first, last, pages = candidate(11, 10, 2)
assert(first == 11 and last == 11 and pages == 2)
assert(candidate(11, 10, 3) == nil)
first, last, pages = candidate(25, 10, 3)
assert(first == 21 and last == 25 and pages == 3)
for total = 0, 40 do
    for pageSize = 1, 7 do
        local _, _, pageCount = candidate(total, pageSize, 1)
        assert(pageCount >= 1 and pageCount % 1 == 0)
        assert(candidate(total, pageSize, pageCount + 1) == nil)
        local covered = 0
        for index = 1, pageCount do
            local a, b, count = candidate(total, pageSize, index)
            assert(count == pageCount)
            assert(a == covered + 1)
            assert(b >= a - 1 and b <= total)
            assert(b - a + 1 <= pageSize)
            if index < pageCount then assert(b - a + 1 == pageSize) end
            covered = b
        end
        assert(covered == total)
    end
end
assert(candidate(10, 0, 1) == nil)
assert(candidate(10, 10, 0) == nil)
assert(candidate(-1, 10, 1) == nil)
assert(candidate(1000001, 10, 1) == nil)
assert(candidate(10.5, 10, 1) == nil)
assert(candidate(10, 10, 1.5) == nil)
assert(candidate(math.huge, 10, 1) == nil)
assert(candidate(0/0, 10, 1) == nil)
assert(candidate("10", 10, 1) == nil)`,
    mutation: ['math.max(1, math.ceil(total / pageSize))', 'math.max(1, math.floor(total / pageSize))'],
  },
  {
    id: 'grid-cell-position', family: 'ui-grid-placement',
    prompt: 'Write a standalone Luau module returning place(index, columns). index must be a finite safe integer in [1, 1000000] and columns a finite safe integer in [1, 1000]; anything else returns nil. Treat the items as filling a grid left to right then top to bottom and return the one-based row and one-based column of the item at index, so index 1 is row 1 column 1 and index columns plus one is row 2 column 1. This is pure layout arithmetic, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `return function(index, columns)
    if not integerValue(index) or index < 1 or index > 1000000 then return nil end
    if not integerValue(columns) or columns < 1 or columns > 1000 then return nil end
    local zeroBased = index - 1
    local row = math.floor(zeroBased / columns) + 1
    local column = zeroBased % columns + 1
    return row, column
end`,
    checks: `local row, column = candidate(1, 4)
assert(row == 1 and column == 1)
row, column = candidate(4, 4)
assert(row == 1 and column == 4)
row, column = candidate(5, 4)
assert(row == 2 and column == 1)
row, column = candidate(9, 4)
assert(row == 3 and column == 1)
row, column = candidate(7, 1)
assert(row == 7 and column == 1)
for columns = 1, 8 do
    local previousRow = 0
    for index = 1, 60 do
        local r, c = candidate(index, columns)
        assert(r >= 1 and c >= 1 and c <= columns)
        assert((r - 1) * columns + c == index)
        assert(r == previousRow or r == previousRow + 1)
        previousRow = r
    end
end
assert(candidate(0, 4) == nil)
assert(candidate(1, 0) == nil)
assert(candidate(1, 1001) == nil)
assert(candidate(1000001, 4) == nil)
assert(candidate(1.5, 4) == nil)
assert(candidate(1, 4.5) == nil)
assert(candidate(math.huge, 4) == nil)
assert(candidate(0/0, 4) == nil)
assert(candidate("1", 4) == nil)`,
    mutation: ['local column = zeroBased % columns + 1', 'local column = zeroBased % columns'],
  },
  {
    id: 'scrollbar-thumb', family: 'ui-scrollbar-thumb',
    prompt: 'Write a standalone Luau module returning thumb(contentHeight, viewportHeight, scroll, trackHeight, minimumThumb). All five must be finite numbers with contentHeight, viewportHeight and trackHeight strictly positive, minimumThumb strictly positive and no larger than trackHeight, and scroll at least zero; anything else returns nil. When the viewport is at least as tall as the content return the full track height and offset zero. Otherwise scroll must not exceed contentHeight minus viewportHeight, and the thumb is the track scaled by the visible fraction but never shorter than minimumThumb, with the offset spreading the scroll across the leftover track so a full scroll puts the thumb exactly at the track end. Return the thumb size and its offset. This is pure layout arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(contentHeight, viewportHeight, scroll, trackHeight, minimumThumb)
    if not finite(contentHeight) or not finite(viewportHeight) or not finite(scroll) then return nil end
    if not finite(trackHeight) or not finite(minimumThumb) then return nil end
    if contentHeight <= 0 or viewportHeight <= 0 or trackHeight <= 0 then return nil end
    if minimumThumb <= 0 or minimumThumb > trackHeight or scroll < 0 then return nil end
    if viewportHeight >= contentHeight then return trackHeight, 0 end
    local maximumScroll = contentHeight - viewportHeight
    if scroll > maximumScroll then return nil end
    local size = math.max(minimumThumb, trackHeight * viewportHeight / contentHeight)
    return size, (trackHeight - size) * (scroll / maximumScroll)
end`,
    checks: `local function near(a, b) return math.abs(a - b) < 1e-9 end
local size, offset = candidate(200, 100, 0, 50, 5)
assert(near(size, 25) and near(offset, 0))
size, offset = candidate(200, 100, 100, 50, 5)
assert(near(size, 25) and near(offset, 25))
size, offset = candidate(200, 100, 50, 50, 5)
assert(near(size, 25) and near(offset, 12.5))
size, offset = candidate(100, 200, 0, 50, 5)
assert(near(size, 50) and near(offset, 0))
size, offset = candidate(100, 100, 0, 50, 5)
assert(near(size, 50) and near(offset, 0))
size, offset = candidate(10000, 10, 0, 200, 20)
assert(near(size, 20) and near(offset, 0))
size, offset = candidate(10000, 10, 9990, 200, 20)
assert(near(size, 20) and near(offset, 180))
for contentHeight = 20, 60, 10 do
    local previous = -1
    for scroll = 0, contentHeight - 10 do
        local s, o = candidate(contentHeight, 10, scroll, 40, 8)
        assert(s >= 8 - 1e-9 and s <= 40 + 1e-9)
        assert(o >= -1e-9 and o + s <= 40 + 1e-9)
        assert(o >= previous - 1e-9)
        previous = o
    end
    local last, lastOffset = candidate(contentHeight, 10, contentHeight - 10, 40, 8)
    assert(near(lastOffset + last, 40))
end
assert(candidate(200, 100, 101, 50, 5) == nil)
assert(candidate(200, 100, -1, 50, 5) == nil)
assert(candidate(0, 100, 0, 50, 5) == nil)
assert(candidate(200, 0, 0, 50, 5) == nil)
assert(candidate(200, 100, 0, 0, 5) == nil)
assert(candidate(200, 100, 0, 50, 0) == nil)
assert(candidate(200, 100, 0, 50, 51) == nil)
assert(candidate(math.huge, 100, 0, 50, 5) == nil)
assert(candidate(200, 100, 0/0, 50, 5) == nil)
assert(candidate("200", 100, 0, 50, 5) == nil)`,
    mutation: ['math.max(minimumThumb, trackHeight * viewportHeight / contentHeight)', 'trackHeight * viewportHeight / contentHeight'],
  },
  {
    id: 'anchor-inside-bounds', family: 'ui-edge-anchoring',
    prompt: 'Write a standalone Luau module returning anchor(x, y, width, height, boundsWidth, boundsHeight). All six must be finite numbers and width, height, boundsWidth and boundsHeight strictly positive; anything else returns nil. Return the x and y the element must move to so it lies fully inside the bounds: push it back from the far edge before pinning it at zero, and when the element is at least as large as the bounds on an axis pin that axis at zero. This is pure layout arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `local function clampAxis(position, size, limit)
    if size >= limit then return 0 end
    if position < 0 then return 0 end
    if position + size > limit then return limit - size end
    return position
end
return function(x, y, width, height, boundsWidth, boundsHeight)
    if not finite(x) or not finite(y) or not finite(width) or not finite(height) then return nil end
    if not finite(boundsWidth) or not finite(boundsHeight) then return nil end
    if width <= 0 or height <= 0 or boundsWidth <= 0 or boundsHeight <= 0 then return nil end
    return clampAxis(x, width, boundsWidth), clampAxis(y, height, boundsHeight)
end`,
    checks: `local x, y = candidate(2, 3, 4, 4, 10, 10)
assert(x == 2 and y == 3)
x, y = candidate(-5, -5, 4, 4, 10, 10)
assert(x == 0 and y == 0)
x, y = candidate(8, 9, 4, 4, 10, 10)
assert(x == 6 and y == 6)
x, y = candidate(6, 6, 4, 4, 10, 10)
assert(x == 6 and y == 6)
x, y = candidate(0, 0, 20, 20, 10, 10)
assert(x == 0 and y == 0)
x, y = candidate(3, 3, 10, 10, 10, 10)
assert(x == 0 and y == 0)
for position = -5, 15 do
    local px, py = candidate(position, position, 4, 4, 10, 10)
    local expected = position
    if position < 0 then expected = 0 elseif position + 4 > 10 then expected = 6 end
    assert(px == expected and py == expected)
    assert(px >= 0 and px + 4 <= 10)
end
for size = 1, 14 do
    local ax = candidate(20, 0, size, 4, 10, 10)
    assert(ax >= 0)
    if size >= 10 then assert(ax == 0) else assert(ax == 10 - size) end
end
assert(candidate(0, 0, 0, 4, 10, 10) == nil)
assert(candidate(0, 0, 4, 0, 10, 10) == nil)
assert(candidate(0, 0, 4, 4, 0, 10) == nil)
assert(candidate(0, 0, 4, 4, 10, -1) == nil)
assert(candidate(math.huge, 0, 4, 4, 10, 10) == nil)
assert(candidate(0/0, 0, 4, 4, 10, 10) == nil)
assert(candidate("0", 0, 4, 4, 10, 10) == nil)`,
    mutation: ['if position + size > limit then return limit - size end', 'if position + size > limit then return limit end'],
  },
  {
    id: 'progress-segments', family: 'ui-progress-segments',
    prompt: 'Write a standalone Luau module returning segments(value, maximum, count). value and maximum must be finite numbers with maximum strictly positive, and count a finite safe integer in [1, 1000]; anything else returns nil. Return how many of the count discrete pips are filled: zero at or below zero, all of them at or above maximum, and otherwise the completed whole pips, rounding DOWN so a partly filled pip does not count. This is pure display arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + safeInteger + `return function(value, maximum, count)
    if not finite(value) or not finite(maximum) or maximum <= 0 then return nil end
    if not integerValue(count) or count < 1 or count > 1000 then return nil end
    if value <= 0 then return 0 end
    if value >= maximum then return count end
    local filled = math.floor(value / maximum * count)
    if filled < 0 then return 0 end
    if filled > count then return count end
    return filled
end`,
    checks: `assert(candidate(0, 10, 5) == 0)
assert(candidate(-3, 10, 5) == 0)
assert(candidate(10, 10, 5) == 5)
assert(candidate(11, 10, 5) == 5)
assert(candidate(1.9, 10, 5) == 0)
assert(candidate(2, 10, 5) == 1)
assert(candidate(3.9, 10, 5) == 1)
assert(candidate(9.99, 10, 5) == 4)
assert(candidate(0.0001, 10, 5) == 0)
assert(candidate(5, 10, 1) == 0)
assert(candidate(10, 10, 1) == 1)
for count = 1, 6 do
    for step = 0, 40 do
        local value = step / 2
        local filled = candidate(value, 10, count)
        local expected
        if value <= 0 then expected = 0
        elseif value >= 10 then expected = count
        else expected = math.floor(value / 10 * count) end
        assert(filled == expected)
        assert(filled >= 0 and filled <= count and filled % 1 == 0)
        if value < 10 then assert(filled < count) end
    end
end
assert(candidate(5, 0, 5) == nil)
assert(candidate(5, -1, 5) == nil)
assert(candidate(5, 10, 0) == nil)
assert(candidate(5, 10, 1001) == nil)
assert(candidate(5, 10, 2.5) == nil)
assert(candidate(math.huge, 10, 5) == nil)
assert(candidate(0/0, 10, 5) == nil)
assert(candidate(5, math.huge, 5) == nil)
assert(candidate("5", 10, 5) == nil)`,
    mutation: ['math.floor(value / maximum * count)', 'math.ceil(value / maximum * count)'],
  },
  {
    id: 'honest-percent', family: 'ui-percent-display',
    prompt: 'Write a standalone Luau module returning percent(value, maximum). Both must be finite numbers and maximum strictly positive; anything else returns nil. Return an integer from 0 to 100 that never lies about completion: 0 only when value is at or below zero, 100 only when value is at or above maximum, otherwise the floor of the ratio held inside 1 to 99 so that any real progress shows at least 1 and an almost complete task shows at most 99. This is pure display arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(value, maximum)
    if not finite(value) or not finite(maximum) or maximum <= 0 then return nil end
    if value <= 0 then return 0 end
    if value >= maximum then return 100 end
    local shown = math.floor(value / maximum * 100)
    if shown >= 100 then return 99 end
    if shown <= 0 then return 1 end
    return shown
end`,
    checks: `assert(candidate(0, 10) == 0)
assert(candidate(-5, 10) == 0)
assert(candidate(10, 10) == 100)
assert(candidate(11, 10) == 100)
assert(candidate(5, 10) == 50)
assert(candidate(0.0001, 10) == 1)
assert(candidate(9.999, 10) == 99)
assert(candidate(1, 1000000) == 1)
assert(candidate(999999, 1000000) == 99)
assert(candidate(7, 7) == 100)
assert(candidate(0, 7) == 0)
for _, maximum in {1, 7, 100, 3.5} do
    for step = 0, 60 do
        local value = maximum * step / 50
        local shown = candidate(value, maximum)
        assert(shown % 1 == 0 and shown >= 0 and shown <= 100)
        assert((shown == 100) == (value >= maximum))
        assert((shown == 0) == (value <= 0))
    end
end
assert(candidate(5, 0) == nil)
assert(candidate(5, -1) == nil)
assert(candidate(math.huge, 10) == nil)
assert(candidate(0/0, 10) == nil)
assert(candidate(5, math.huge) == nil)
assert(candidate("5", 10) == nil)
assert(candidate(5, nil) == nil)`,
    mutation: ['if value >= maximum then return 100 end', 'if value > maximum then return 100 end'],
  },
  {
    id: 'remap-range', family: 'ui-value-remap',
    prompt: 'Write a standalone Luau module returning remap(value, fromLow, fromHigh, toLow, toHigh). All five must be finite numbers and fromLow must differ from fromHigh; anything else returns nil. Map value linearly from the input range onto the output range, clamping the interpolation fraction to [0,1] so a value outside the input range lands exactly on the nearer output endpoint, and return nil if the result is not finite. Inverted input or output ranges are valid. This is pure arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(value, fromLow, fromHigh, toLow, toHigh)
    if not finite(value) or not finite(fromLow) or not finite(fromHigh) then return nil end
    if not finite(toLow) or not finite(toHigh) or fromLow == fromHigh then return nil end
    local fraction = (value - fromLow) / (fromHigh - fromLow)
    if fraction <= 0 then fraction = 0 end
    if fraction >= 1 then fraction = 1 end
    local result = toLow + (toHigh - toLow) * fraction
    if not finite(result) then return nil end
    return result
end`,
    checks: `local function near(a, b) return math.abs(a - b) < 1e-9 end
assert(near(candidate(5, 0, 10, 0, 100), 50))
assert(near(candidate(2, 0, 10, 0, 100), 20))
assert(near(candidate(0, 0, 10, 0, 100), 0))
assert(near(candidate(10, 0, 10, 0, 100), 100))
assert(near(candidate(-5, 0, 10, 0, 100), 0))
assert(near(candidate(15, 0, 10, 0, 100), 100))
assert(near(candidate(0, 0, 10, 100, 0), 100))
assert(near(candidate(10, 0, 10, 100, 0), 0))
assert(near(candidate(2, 0, 10, 100, 0), 80))
assert(near(candidate(0, 10, 0, 0, 100), 100))
assert(near(candidate(-1, -1, 1, -10, 10), -10))
assert(near(candidate(0, -1, 1, -10, 10), 0))
for step = -4, 14 do
    local value = step / 10
    local result = candidate(value, 0, 1, 20, 60)
    assert(result >= 20 - 1e-9 and result <= 60 + 1e-9)
    if value >= 0 and value <= 1 then assert(near(result, 20 + 40 * value)) end
end
assert(candidate(5, 3, 3, 0, 1) == nil)
assert(candidate(math.huge, 0, 10, 0, 1) == nil)
assert(candidate(0/0, 0, 10, 0, 1) == nil)
assert(candidate(5, 0, math.huge, 0, 1) == nil)
assert(candidate(5, 0, 10, 0, math.huge) == nil)
assert(candidate("5", 0, 10, 0, 1) == nil)
assert(candidate(5, 0, 10, 0, nil) == nil)`,
    mutation: ['if fraction >= 1 then fraction = 1 end', 'if fraction >= 2 then fraction = 1 end'],
  },
  {
    id: 'smoothstep-between', family: 'ui-eased-interpolation',
    prompt: 'Write a standalone Luau module returning ease(from, to, fraction). All three must be finite numbers; anything else returns nil. Clamp fraction to [0,1], apply the smoothstep curve fraction squared times three minus twice fraction, and return the interpolation between from and to at that eased position, or nil if the result is not finite. The curve is flat at both ends, so a quarter of the way through covers 15.625 percent of the distance. This is pure arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(from, to, fraction)
    if not finite(from) or not finite(to) or not finite(fraction) then return nil end
    local clamped = fraction
    if clamped < 0 then clamped = 0 end
    if clamped > 1 then clamped = 1 end
    local eased = clamped * clamped * (3 - 2 * clamped)
    local result = from + (to - from) * eased
    if not finite(result) then return nil end
    return result
end`,
    checks: `local function near(a, b) return math.abs(a - b) < 1e-9 end
assert(near(candidate(0, 10, 0), 0))
assert(near(candidate(0, 10, 1), 10))
assert(near(candidate(0, 10, 0.5), 5))
assert(near(candidate(0, 100, 0.25), 15.625))
assert(near(candidate(0, 100, 0.75), 84.375))
assert(near(candidate(0, 10, -1), 0))
assert(near(candidate(0, 10, 2), 10))
assert(near(candidate(10, 0, 0.25), 8.4375))
assert(near(candidate(-4, 4, 0.5), 0))
local previous = -1e9
for step = 0, 100 do
    local value = candidate(0, 1, step / 100)
    assert(value >= -1e-9 and value <= 1 + 1e-9)
    assert(value >= previous - 1e-12)
    previous = value
    assert(near(value + candidate(0, 1, 1 - step / 100), 1))
end
assert(near(candidate(0, 1, 0.1), 0.028))
assert(candidate(math.huge, 10, 0.5) == nil)
assert(candidate(0, math.huge, 0.5) == nil)
assert(candidate(0, 10, 0/0) == nil)
assert(candidate(0, 10, math.huge) == nil)
assert(candidate("0", 10, 0.5) == nil)
assert(candidate(0, 10, nil) == nil)`,
    mutation: ['clamped * clamped * (3 - 2 * clamped)', 'clamped'],
  },
  {
    id: 'parse-hex-colour', family: 'ui-hex-colour',
    prompt: 'Write a standalone Luau module returning parse(hex). hex must be a string, case insensitive, with an optional leading hash followed by exactly three or six hexadecimal digits; anything else returns nil. Return the red, green and blue channels as integers in [0,255], expanding each shorthand digit by multiplying it by 17 so "#f80" is 255, 136, 0. This is pure parsing, not a RemoteEvent handler or persistent save.',
    source: `local digits = "0123456789abcdef"
local function nibble(character)
    local index = string.find(digits, character, 1, true)
    return if index then index - 1 else nil
end
return function(hex)
    if type(hex) ~= "string" or #hex > 8 then return nil end
    local body = if string.sub(hex, 1, 1) == "#" then string.sub(hex, 2) else hex
    body = string.lower(body)
    if #body ~= 3 and #body ~= 6 then return nil end
    local parts = {}
    for i = 1, #body do
        local value = nibble(string.sub(body, i, i))
        if value == nil then return nil end
        table.insert(parts, value)
    end
    if #body == 3 then
        return parts[1] * 17, parts[2] * 17, parts[3] * 17
    end
    return parts[1] * 16 + parts[2], parts[3] * 16 + parts[4], parts[5] * 16 + parts[6]
end`,
    checks: `local red, green, blue = candidate("#ffffff")
assert(red == 255 and green == 255 and blue == 255)
red, green, blue = candidate("#000000")
assert(red == 0 and green == 0 and blue == 0)
red, green, blue = candidate("FF8000")
assert(red == 255 and green == 128 and blue == 0)
red, green, blue = candidate("#f80")
assert(red == 255 and green == 136 and blue == 0)
red, green, blue = candidate("abc")
assert(red == 170 and green == 187 and blue == 204)
red, green, blue = candidate("#000")
assert(red == 0 and green == 0 and blue == 0)
red, green, blue = candidate("#FFF")
assert(red == 255 and green == 255 and blue == 255)
for byte = 0, 255 do
    local text = string.format("#%02x%02x%02x", byte, 255 - byte, byte)
    local r, g, b = candidate(text)
    assert(r == byte and g == 255 - byte and b == byte)
    local upper, lower = candidate(string.upper(text)), candidate(text)
    assert(upper == lower)
end
for value = 0, 15 do
    local r = candidate(string.format("%x%x%x", value, value, value))
    assert(r == value * 17)
end
assert(candidate("#12345") == nil)
assert(candidate("#1234567") == nil)
assert(candidate("gg0000") == nil)
assert(candidate("#gg0") == nil)
assert(candidate("#ff 00") == nil)
assert(candidate("") == nil)
assert(candidate("#") == nil)
assert(candidate("##fff") == nil)
assert(candidate(123) == nil)
assert(candidate(nil) == nil)
assert(candidate({}) == nil)`,
    mutation: ['parts[1] * 17', 'parts[1] * 16'],
  },
  {
    id: 'deep-table-equality', family: 'data-deep-equality',
    prompt: 'Write a standalone Luau module returning equal(left, right). Compare plain values structurally: numbers, strings, booleans and nil compare with the equality operator, and tables compare key by key in both directions so an extra key on either side makes them unequal. Return nil, meaning the comparison cannot be trusted, when either side carries a metatable, when a value is a function, thread or userdata, or when nesting passes eight levels. NaN is never equal to itself. This is pure comparison, not a RemoteEvent handler or persistent save.',
    source: `local function compare(left, right, depth)
    if depth > 8 then return nil end
    local leftKind, rightKind = type(left), type(right)
    if leftKind ~= rightKind then return false end
    if leftKind == "table" then
        if getmetatable(left) ~= nil or getmetatable(right) ~= nil then return nil end
        for key, value in pairs(left) do
            local other = right[key]
            if other == nil then return false end
            local same = compare(value, other, depth + 1)
            if same ~= true then return same end
        end
        for key in pairs(right) do
            if left[key] == nil then return false end
        end
        return true
    end
    if leftKind ~= "number" and leftKind ~= "string" and leftKind ~= "boolean" and leftKind ~= "nil" then return nil end
    return left == right
end
return function(left, right)
    return compare(left, right, 1)
end`,
    checks: `assert(candidate(1, 1) == true)
assert(candidate(1, 2) == false)
assert(candidate(1, "1") == false)
assert(candidate(nil, nil) == true)
assert(candidate(nil, {}) == false)
assert(candidate(true, true) == true)
assert(candidate(true, false) == false)
assert(candidate(0/0, 0/0) == false)
assert(candidate({}, {}) == true)
assert(candidate({1, 2}, {1, 2}) == true)
assert(candidate({1, 2}, {1, 3}) == false)
assert(candidate({1, 2}, {1, 2, 3}) == false)
assert(candidate({1, 2, 3}, {1, 2}) == false)
assert(candidate({a = 1, b = 2}, {b = 2, a = 1}) == true)
assert(candidate({a = 1}, {a = 1, b = 2}) == false)
assert(candidate({a = {b = {c = 1}}}, {a = {b = {c = 1}}}) == true)
assert(candidate({a = {b = {c = 1}}}, {a = {b = {c = 2}}}) == false)
assert(candidate({a = {b = 1}}, {a = 1}) == false)
assert(candidate(setmetatable({}, {}), {}) == nil)
assert(candidate({}, setmetatable({}, {})) == nil)
assert(candidate({inner = setmetatable({}, {})}, {inner = {}}) == nil)
local closure = function() return 1 end
assert(candidate(closure, closure) == nil)
assert(candidate({value = closure}, {value = closure}) == nil)
local function chain(depth)
    local root = {}
    local node = root
    for _ = 1, depth do
        node.child = {}
        node = node.child
    end
    return root
end
assert(candidate(chain(5), chain(5)) == true)
assert(candidate(chain(12), chain(12)) == nil)`,
    mutation: ['if left[key] == nil then return false end', 'if left[key] == nil then return true end'],
  },
  {
    id: 'merge-settings', family: 'ui-settings-merge',
    prompt: 'Write a standalone Luau module returning merge(defaults, overrides). Both must be plain tables with no metatable whose keys are nonempty strings and whose values are numbers, strings, booleans or nested plain tables no more than four levels deep; anything else returns nil. Return a fresh deep copy of defaults in which an override replaces a default only when it has the same type, nested tables merge recursively, and a key absent from defaults is dropped so a client cannot introduce a setting. Neither argument is mutated. This is pure data shaping, not a RemoteEvent handler or persistent save.',
    source: `local function plainTable(value)
    return type(value) == "table" and getmetatable(value) == nil
end
local function validate(node, depth)
    if depth > 4 or not plainTable(node) then return false end
    for key, value in pairs(node) do
        if type(key) ~= "string" or key == "" then return false end
        local kind = type(value)
        if kind == "table" then
            if not validate(value, depth + 1) then return false end
        elseif kind ~= "number" and kind ~= "string" and kind ~= "boolean" then
            return false
        end
    end
    return true
end
local function combine(defaults, overrides)
    local result = {}
    for key, value in pairs(defaults) do
        local override = overrides[key]
        if plainTable(value) then
            result[key] = combine(value, if plainTable(override) then override else {})
        elseif override ~= nil and type(override) == type(value) then
            result[key] = override
        else
            result[key] = value
        end
    end
    return result
end
return function(defaults, overrides)
    if not validate(defaults, 1) or not validate(overrides, 1) then return nil end
    return combine(defaults, overrides)
end`,
    checks: `local defaults = { volume = 5, muted = false, theme = "dark", hud = { scale = 1, compact = false } }
local overrides = { volume = 9, hud = { scale = 2 }, unknown = 3 }
local result = candidate(defaults, overrides)
assert(result.volume == 9 and result.muted == false and result.theme == "dark")
assert(result.hud.scale == 2 and result.hud.compact == false)
assert(result.unknown == nil)
assert(result ~= defaults and result.hud ~= defaults.hud and result.hud ~= overrides.hud)
result.volume = 111
result.hud.scale = 222
assert(defaults.volume == 5 and defaults.hud.scale == 1)
assert(overrides.volume == 9 and overrides.hud.scale == 2)
assert(candidate({ a = 1 }, { a = "text" }).a == 1)
assert(candidate({ a = 1 }, { a = false }).a == 1)
assert(candidate({ a = true }, { a = false }).a == false)
assert(candidate({ a = "x" }, { a = "y" }).a == "y")
assert(candidate({ hud = { scale = 1 } }, { hud = 5 }).hud.scale == 1)
assert(candidate({ a = 1 }, {}).a == 1)
local empty = candidate({}, { anything = 1 })
assert(next(empty) == nil)
assert(candidate({ a = { b = { c = { d = 1 } } } }, {}) ~= nil)
assert(candidate({ a = { b = { c = { d = { e = 1 } } } } }, {}) == nil)
assert(candidate({ [1] = "x" }, {}) == nil)
assert(candidate({ [""] = "x" }, {}) == nil)
assert(candidate({ a = function() return 1 end }, {}) == nil)
assert(candidate(setmetatable({}, {}), {}) == nil)
assert(candidate({}, setmetatable({}, {})) == nil)
assert(candidate("defaults", {}) == nil)
assert(candidate({}, nil) == nil)`,
    mutation: ['elseif override ~= nil and type(override) == type(value) then', 'elseif override ~= nil then'],
  },
  {
    id: 'validate-action-payload', family: 'contract-payload-shape',
    prompt: 'Write a standalone Luau module returning validate(payload). payload must be a plain table with no metatable whose only keys are action, slot, amount and an optional note. action must be one of "equip", "drop" or "split"; slot a finite safe integer in [1,9]; amount a finite safe integer in [1,999]; note, when present, a string of at most 64 bytes. On success return a fresh normalised record holding exactly those fields. On failure return nil and one of the reasons "not-a-plain-table", "unknown-field", "bad-action", "bad-slot", "bad-amount" or "bad-note". This is pure shape validation of an untrusted request, not a RemoteEvent handler or persistent save.',
    source: safeInteger + `local allowedActions = { equip = true, drop = true, split = true }
return function(payload)
    if type(payload) ~= "table" or getmetatable(payload) ~= nil then return nil, "not-a-plain-table" end
    for key in pairs(payload) do
        if key ~= "action" and key ~= "slot" and key ~= "amount" and key ~= "note" then return nil, "unknown-field" end
    end
    local action = payload.action
    if type(action) ~= "string" or not allowedActions[action] then return nil, "bad-action" end
    local slot = payload.slot
    if not integerValue(slot) or slot < 1 or slot > 9 then return nil, "bad-slot" end
    local amount = payload.amount
    if not integerValue(amount) or amount < 1 or amount > 999 then return nil, "bad-amount" end
    local note = payload.note
    if note ~= nil and (type(note) ~= "string" or #note > 64) then return nil, "bad-note" end
    return { action = action, slot = slot, amount = amount, note = note }
end`,
    checks: `local function reason(payload)
    local ok, why = candidate(payload)
    assert(ok == nil)
    return why
end
local request = { action = "equip", slot = 3, amount = 1 }
local record = candidate(request)
assert(record ~= nil and record ~= request)
assert(record.action == "equip" and record.slot == 3 and record.amount == 1 and record.note == nil)
local fields = 0
for _ in pairs(record) do fields += 1 end
assert(fields == 3)
local noted = candidate({ action = "drop", slot = 9, amount = 999, note = "bye" })
assert(noted ~= nil)
assert(noted.note == "bye" and noted.slot == 9 and noted.amount == 999)
for _, action in {"equip", "drop", "split"} do
    local accepted = candidate({ action = action, slot = 1, amount = 1 })
    assert(accepted ~= nil and accepted.action == action)
end
for slot = 1, 9 do
    local accepted = candidate({ action = "equip", slot = slot, amount = 1 })
    assert(accepted ~= nil, "slot " .. slot .. " is inside the documented range")
    assert(accepted.slot == slot)
end
assert(reason("nope") == "not-a-plain-table")
assert(reason(setmetatable({ action = "equip", slot = 1, amount = 1 }, {})) == "not-a-plain-table")
assert(reason({ action = "equip", slot = 1, amount = 1, extra = 1 }) == "unknown-field")
assert(reason({ action = "fly", slot = 1, amount = 1 }) == "bad-action")
assert(reason({ slot = 1, amount = 1 }) == "bad-action")
assert(reason({ action = 5, slot = 1, amount = 1 }) == "bad-action")
assert(reason({ action = "equip", slot = 0, amount = 1 }) == "bad-slot")
assert(reason({ action = "equip", slot = 10, amount = 1 }) == "bad-slot")
assert(reason({ action = "equip", slot = 1.5, amount = 1 }) == "bad-slot")
assert(reason({ action = "equip", slot = 0/0, amount = 1 }) == "bad-slot")
assert(reason({ action = "equip", slot = math.huge, amount = 1 }) == "bad-slot")
assert(reason({ action = "equip", slot = "1", amount = 1 }) == "bad-slot")
assert(reason({ action = "equip", slot = 1, amount = 0 }) == "bad-amount")
assert(reason({ action = "equip", slot = 1, amount = 1000 }) == "bad-amount")
assert(reason({ action = "equip", slot = 1, amount = 1.5 }) == "bad-amount")
assert(reason({ action = "equip", slot = 1, amount = 0/0 }) == "bad-amount")
assert(reason({ action = "equip", slot = 1, amount = 1, note = string.rep("n", 65) }) == "bad-note")
assert(reason({ action = "equip", slot = 1, amount = 1, note = 5 }) == "bad-note")
assert(candidate({ action = "equip", slot = 1, amount = 1, note = string.rep("n", 64) }) ~= nil)`,
    mutation: ['slot > 9', 'slot >= 9'],
  },
  {
    id: 'filter-by-search', family: 'ui-search-filter',
    prompt: 'Write a standalone Luau module returning filter(items, query). items must be a plain dense array with no metatable whose entries are nonempty strings of at most 64 bytes, and query a string of at most 64 bytes; anything else returns nil. Trim leading and trailing whitespace from the query and match it case insensitively as a LITERAL substring, never as a pattern, so a query of "." matches only items containing a dot. An empty or whitespace-only query keeps every item. Return a fresh array in the original order without mutating the input. This is pure list filtering, not a RemoteEvent handler or persistent save.',
    source: denseArray + `return function(items, query)
    if not denseArray(items) or type(query) ~= "string" or #query > 64 then return nil end
    for i = 1, #items do
        local item = items[i]
        if type(item) ~= "string" or item == "" or #item > 64 then return nil end
    end
    local needle = string.lower((string.gsub(query, "^%s+", "")))
    needle = (string.gsub(needle, "%s+$", ""))
    local result = {}
    for i = 1, #items do
        if needle == "" or string.find(string.lower(items[i]), needle, 1, true) then
            table.insert(result, items[i])
        end
    end
    return result
end`,
    checks: `local items = { "Sword", "shield", "Bow", "Broadsword" }
local function join(list) return table.concat(list, "|") end
assert(join(candidate(items, "s")) == "Sword|shield|Broadsword")
assert(join(candidate(items, "SWORD")) == "Sword|Broadsword")
assert(join(candidate(items, "  sword  ")) == "Sword|Broadsword")
assert(join(candidate(items, "bow")) == "Bow")
assert(join(candidate(items, "")) == "Sword|shield|Bow|Broadsword")
assert(join(candidate(items, "   ")) == "Sword|shield|Bow|Broadsword")
assert(#candidate(items, "zzz") == 0)
local copy = candidate(items, "")
assert(copy ~= items and #copy == 4)
copy[1] = "changed"
assert(items[1] == "Sword")
assert(join(candidate({ "a.b", "axb" }, ".")) == "a.b")
assert(join(candidate({ "50%", "50x" }, "%")) == "50%")
assert(join(candidate({ "a+b", "aab" }, "a+b")) == "a+b")
assert(join(candidate({ "[tag]", "tag" }, "[tag]")) == "[tag]")
assert(join(candidate({ "a-b", "ab" }, "a-b")) == "a-b")
assert(#candidate({}, "x") == 0)
assert(candidate({ "ok", 5 }, "o") == nil)
assert(candidate({ "ok", "" }, "o") == nil)
assert(candidate({ string.rep("x", 65) }, "x") == nil)
assert(candidate({ [1] = "a", [3] = "b" }, "a") == nil)
assert(candidate({ "a", extra = "b" }, "a") == nil)
assert(candidate(setmetatable({ "a" }, {}), "a") == nil)
assert(candidate("items", "a") == nil)
assert(candidate({ "a" }, string.rep("q", 65)) == nil)
assert(candidate({ "a" }, 5) == nil)
assert(candidate({ "a" }, nil) == nil)`,
    mutation: ['string.find(string.lower(items[i]), needle, 1, true)', 'string.find(string.lower(items[i]), needle)'],
  },
  {
    id: 'sort-inventory-rows', family: 'data-inventory-sort-key',
    prompt: 'Write a standalone Luau module returning sortItems(items). items must be a plain dense array with no metatable whose entries are plain tables with no metatable holding a nonempty string id, a nonempty string name and a rarity that is one of "common", "uncommon", "rare", "epic" or "legendary"; anything else returns nil. Return a fresh array of fresh records ordered by rarity from legendary down to common, then by name ascending compared case insensitively, then by id ascending as a deterministic tiebreak. The input and its records are not mutated. This is pure sorting, not a RemoteEvent handler or persistent save.',
    source: denseArray + `local rarityRank = { common = 1, uncommon = 2, rare = 3, epic = 4, legendary = 5 }
return function(items)
    if not denseArray(items) then return nil end
    local rows = {}
    for i = 1, #items do
        local item = items[i]
        if type(item) ~= "table" or getmetatable(item) ~= nil then return nil end
        if type(item.id) ~= "string" or item.id == "" then return nil end
        if type(item.name) ~= "string" or item.name == "" then return nil end
        if type(item.rarity) ~= "string" or rarityRank[item.rarity] == nil then return nil end
        table.insert(rows, { id = item.id, name = item.name, rarity = item.rarity })
    end
    table.sort(rows, function(a, b)
        if a.rarity ~= b.rarity then return rarityRank[a.rarity] > rarityRank[b.rarity] end
        local aName, bName = string.lower(a.name), string.lower(b.name)
        if aName ~= bName then return aName < bName end
        return a.id < b.id
    end)
    return rows
end`,
    checks: `local input = {
    { id = "i4", name = "banana", rarity = "common", secret = "drop" },
    { id = "i1", name = "Apple", rarity = "common" },
    { id = "i3", name = "torch", rarity = "legendary" },
    { id = "i2", name = "Torch", rarity = "legendary" },
    { id = "i5", name = "cape", rarity = "rare" },
}
local sorted = candidate(input)
assert(#sorted == 5)
assert(sorted[1].id == "i2" and sorted[2].id == "i3")
assert(sorted[3].id == "i5")
assert(sorted[4].id == "i1" and sorted[5].id == "i4")
assert(sorted[1].name == "Torch" and sorted[2].name == "torch")
assert(sorted ~= input and sorted[1] ~= input[4])
assert(sorted[5].secret == nil)
sorted[5].name = "mutated"
assert(input[1].name == "banana" and input[1].id == "i4")
local rank = { common = 1, uncommon = 2, rare = 3, epic = 4, legendary = 5 }
for i = 1, #sorted - 1 do
    local a, b = sorted[i], sorted[i + 1]
    assert(rank[a.rarity] >= rank[b.rarity])
    if a.rarity == b.rarity then
        local an, bn = string.lower(a.name), string.lower(b.name)
        assert(an < bn or (an == bn and a.id < b.id))
    end
end
assert(#candidate({}) == 0)
local single = candidate({ { id = "x", name = "y", rarity = "epic" } })
assert(#single == 1 and single[1].rarity == "epic")
assert(candidate({ { id = "", name = "y", rarity = "epic" } }) == nil)
assert(candidate({ { id = "x", name = "", rarity = "epic" } }) == nil)
assert(candidate({ { id = "x", name = "y", rarity = "mythic" } }) == nil)
assert(candidate({ { id = "x", name = "y" } }) == nil)
assert(candidate({ { id = 5, name = "y", rarity = "epic" } }) == nil)
assert(candidate({ "not a record" }) == nil)
assert(candidate({ setmetatable({ id = "x", name = "y", rarity = "epic" }, {}) }) == nil)
assert(candidate({ [1] = { id = "x", name = "y", rarity = "epic" }, [3] = {} }) == nil)
assert(candidate(setmetatable({}, {})) == nil)
assert(candidate("items") == nil)`,
    mutation: ['if aName ~= bName then return aName < bName end', 'if aName ~= bName then return aName > bName end'],
  },
  {
    id: 'tooltip-placement', family: 'ui-tooltip-flip',
    prompt: 'Write a standalone Luau module returning tooltip(anchorX, anchorY, tipWidth, tipHeight, screenWidth, screenHeight, gap). All seven must be finite numbers, the four sizes strictly positive and gap at least zero; anything else returns nil. Place the tip at the anchor horizontally and gap below it vertically, flipping to the left of the anchor when it would pass the right screen edge and above the anchor when the gapped tip would pass the bottom edge, then push the result back inside the screen and finally pin it at zero. Return x, y and the two flip booleans. This is pure layout arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + `return function(anchorX, anchorY, tipWidth, tipHeight, screenWidth, screenHeight, gap)
    if not finite(anchorX) or not finite(anchorY) or not finite(tipWidth) or not finite(tipHeight) then return nil end
    if not finite(screenWidth) or not finite(screenHeight) or not finite(gap) then return nil end
    if tipWidth <= 0 or tipHeight <= 0 or screenWidth <= 0 or screenHeight <= 0 or gap < 0 then return nil end
    local x, flippedX = anchorX, false
    if anchorX + tipWidth > screenWidth then
        x, flippedX = anchorX - tipWidth, true
    end
    local y, flippedY = anchorY + gap, false
    if anchorY + gap + tipHeight > screenHeight then
        y, flippedY = anchorY - gap - tipHeight, true
    end
    if x + tipWidth > screenWidth then x = screenWidth - tipWidth end
    if x < 0 then x = 0 end
    if y + tipHeight > screenHeight then y = screenHeight - tipHeight end
    if y < 0 then y = 0 end
    return x, y, flippedX, flippedY
end`,
    checks: `local x, y, flippedX, flippedY = candidate(10, 10, 20, 8, 100, 100, 4)
assert(x == 10 and y == 14 and flippedX == false and flippedY == false)
x, y, flippedX, flippedY = candidate(90, 10, 20, 8, 100, 100, 4)
assert(x == 70 and flippedX == true and y == 14 and flippedY == false)
x, y, flippedX, flippedY = candidate(80, 10, 20, 8, 100, 100, 4)
assert(x == 80 and flippedX == false)
x, y, flippedX, flippedY = candidate(10, 90, 20, 8, 100, 100, 4)
assert(flippedY == true and y == 78 and flippedX == false)
x, y, flippedX, flippedY = candidate(10, 89, 20, 8, 100, 100, 4)
assert(flippedY == true and y == 77)
x, y, flippedX, flippedY = candidate(10, 88, 20, 8, 100, 100, 4)
assert(flippedY == false and y == 92)
x, y, flippedX, flippedY = candidate(2, 1, 20, 8, 100, 100, 4)
assert(x == 2 and y == 5)
x, y, flippedX, flippedY = candidate(0, 0, 20, 8, 100, 100, 0)
assert(x == 0 and y == 0 and flippedX == false and flippedY == false)
x, y = candidate(5, 5, 200, 8, 100, 100, 4)
assert(x == 0)
x, y = candidate(5, 5, 20, 400, 100, 100, 4)
assert(y == 0)
for anchor = 0, 100 do
    local px, py, fx, fy = candidate(anchor, anchor, 20, 8, 100, 100, 4)
    assert(px >= 0 and px + 20 <= 100)
    assert(py >= 0 and py + 8 <= 100)
    assert(fx == (anchor + 20 > 100))
    assert(fy == (anchor + 4 + 8 > 100))
end
assert(candidate(0, 0, 0, 8, 100, 100, 4) == nil)
assert(candidate(0, 0, 20, 0, 100, 100, 4) == nil)
assert(candidate(0, 0, 20, 8, 0, 100, 4) == nil)
assert(candidate(0, 0, 20, 8, 100, 0, 4) == nil)
assert(candidate(0, 0, 20, 8, 100, 100, -1) == nil)
assert(candidate(math.huge, 0, 20, 8, 100, 100, 4) == nil)
assert(candidate(0, 0/0, 20, 8, 100, 100, 4) == nil)
assert(candidate("0", 0, 20, 8, 100, 100, 4) == nil)`,
    mutation: ['if anchorY + gap + tipHeight > screenHeight then', 'if anchorY + tipHeight > screenHeight then'],
  },
  {
    id: 'zoom-notches', family: 'ui-zoom-step',
    prompt: 'Write a standalone Luau module returning zoom(current, notches, minimum, maximum, factor). current, minimum, maximum and factor must be finite numbers with minimum strictly positive, maximum at least minimum, factor greater than 1 and at most 8, and current inside the closed range; notches must be a finite safe integer with magnitude at most 64; anything else returns nil. Multiply by factor once per positive notch and divide once per negative notch, then clamp into the range, returning the clamped scale and whether clamping changed it. Return nil if the unclamped scale is not finite. This is pure arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + safeInteger + `return function(current, notches, minimum, maximum, factor)
    if not finite(current) or not finite(minimum) or not finite(maximum) or not finite(factor) then return nil end
    if not integerValue(notches) or math.abs(notches) > 64 then return nil end
    if minimum <= 0 or maximum < minimum or factor <= 1 or factor > 8 then return nil end
    if current < minimum or current > maximum then return nil end
    local scale = current
    for _ = 1, math.abs(notches) do
        scale = if notches > 0 then scale * factor else scale / factor
    end
    if not finite(scale) then return nil end
    local clamped = math.min(math.max(scale, minimum), maximum)
    return clamped, clamped ~= scale
end`,
    checks: `local function near(a, b) return math.abs(a - b) < 1e-9 end
local scale, clamped = candidate(1, 0, 0.5, 4, 2)
assert(near(scale, 1) and clamped == false)
scale, clamped = candidate(1, 1, 0.5, 4, 2)
assert(near(scale, 2) and clamped == false)
scale, clamped = candidate(1, 2, 0.5, 4, 2)
assert(near(scale, 4) and clamped == false)
scale, clamped = candidate(1, 3, 0.5, 4, 2)
assert(near(scale, 4) and clamped == true)
scale, clamped = candidate(1, -1, 0.5, 4, 2)
assert(near(scale, 0.5) and clamped == false)
scale, clamped = candidate(1, -2, 0.5, 4, 2)
assert(near(scale, 0.5) and clamped == true)
scale, clamped = candidate(4, 1, 0.5, 4, 2)
assert(near(scale, 4) and clamped == true)
scale, clamped = candidate(0.5, -1, 0.5, 4, 2)
assert(near(scale, 0.5) and clamped == true)
local previous = 0
for notches = -6, 6 do
    local value = candidate(1, notches, 0.5, 4, 2)
    assert(value >= 0.5 - 1e-9 and value <= 4 + 1e-9)
    assert(value >= previous - 1e-9)
    previous = value
end
assert(near(candidate(1, 2, 0.1, 100, 1.5), 2.25))
assert(candidate(1, 1, 0.5, 4, 1) == nil)
assert(candidate(1, 1, 0.5, 4, 9) == nil)
assert(candidate(1, 1, 0, 4, 2) == nil)
assert(candidate(1, 1, 4, 0.5, 2) == nil)
assert(candidate(5, 1, 0.5, 4, 2) == nil)
assert(candidate(0.1, 1, 0.5, 4, 2) == nil)
assert(candidate(1, 1.5, 0.5, 4, 2) == nil)
assert(candidate(1, 65, 0.5, 4, 2) == nil)
assert(candidate(1, 0/0, 0.5, 4, 2) == nil)
assert(candidate(math.huge, 1, 0.5, 4, 2) == nil)
assert(candidate("1", 1, 0.5, 4, 2) == nil)`,
    mutation: ['math.min(math.max(scale, minimum), maximum)', 'math.max(math.min(scale, minimum), maximum)'],
  },
  {
    id: 'snap-slider-value', family: 'ui-slider-snap',
    prompt: 'Write a standalone Luau module returning snap(value, minimum, maximum, steps). value, minimum and maximum must be finite numbers with maximum strictly greater than minimum and a finite span, and steps a finite safe integer in [1, 1000000]; anything else returns nil. Divide the range into steps equal intervals and return the snapped value together with its zero-based step index, choosing the nearest boundary with an exact half rounding UP, and clamping a value outside the range to index 0 or index steps. This is pure arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + safeInteger + `return function(value, minimum, maximum, steps)
    if not finite(value) or not finite(minimum) or not finite(maximum) then return nil end
    if not integerValue(steps) or steps < 1 or steps > 1000000 then return nil end
    if maximum <= minimum then return nil end
    local span = maximum - minimum
    if not finite(span) then return nil end
    local raw = (value - minimum) / span * steps
    local index
    if raw <= 0 then
        index = 0
    elseif raw >= steps then
        index = steps
    else
        index = math.floor(raw + 0.5)
    end
    return minimum + span * index / steps, index
end`,
    checks: `local function near(a, b) return math.abs(a - b) < 1e-9 end
local value, index = candidate(0.5, 0, 1, 2)
assert(near(value, 0.5) and index == 1)
value, index = candidate(0, 0, 1, 4)
assert(near(value, 0) and index == 0)
value, index = candidate(1, 0, 1, 4)
assert(near(value, 1) and index == 4)
value, index = candidate(0.125, 0, 1, 4)
assert(near(value, 0.25) and index == 1)
value, index = candidate(0.124, 0, 1, 4)
assert(near(value, 0) and index == 0)
value, index = candidate(0.24, 0, 1, 4)
assert(near(value, 0.25) and index == 1)
value, index = candidate(-5, 0, 1, 4)
assert(near(value, 0) and index == 0)
value, index = candidate(5, 0, 1, 4)
assert(near(value, 1) and index == 4)
value, index = candidate(7, -10, 10, 1)
assert(near(value, 10) and index == 1)
value, index = candidate(-1, -10, 10, 1)
assert(near(value, -10) and index == 0)
for steps = 1, 8 do
    for tick = -20, 120 do
        local target = tick / 100
        local snapped, position = candidate(target, 0, 1, steps)
        assert(position % 1 == 0 and position >= 0 and position <= steps)
        assert(near(snapped, position / steps))
        if target > 0 and target < 1 then
            local best = math.abs(target - position / steps)
            for other = 0, steps do
                assert(math.abs(target - other / steps) >= best - 1e-9)
            end
        end
    end
end
assert(candidate(0.5, 1, 1, 4) == nil)
assert(candidate(0.5, 2, 1, 4) == nil)
assert(candidate(0.5, 0, 1, 0) == nil)
assert(candidate(0.5, 0, 1, 1.5) == nil)
assert(candidate(0.5, 0, 1, 1000001) == nil)
assert(candidate(0/0, 0, 1, 4) == nil)
assert(candidate(math.huge, 0, 1, 4) == nil)
assert(candidate(0.5, 0, math.huge, 4) == nil)
assert(candidate("0.5", 0, 1, 4) == nil)`,
    mutation: ['index = math.floor(raw + 0.5)', 'index = math.floor(raw)'],
  },
  {
    id: 'notification-queue', family: 'ui-notification-queue',
    prompt: 'Write a standalone Luau module returning push(queue, message, limit). queue must be a plain dense array with no metatable whose entries are nonempty strings of at most 80 bytes, message such a string, and limit a finite safe integer in [1, 64]; anything else returns nil. Return a fresh array: append message unless it repeats the current last entry, then drop entries from the front until at most limit remain, so an over-long incoming queue is trimmed too. The input array is never mutated. This is pure data shaping, not a RemoteEvent handler or persistent save.',
    source: denseArray + safeInteger + `return function(queue, message, limit)
    if not denseArray(queue) then return nil end
    if type(message) ~= "string" or message == "" or #message > 80 then return nil end
    if not integerValue(limit) or limit < 1 or limit > 64 then return nil end
    for i = 1, #queue do
        local entry = queue[i]
        if type(entry) ~= "string" or entry == "" or #entry > 80 then return nil end
    end
    local result = {}
    for i = 1, #queue do
        table.insert(result, queue[i])
    end
    if result[#result] ~= message then
        table.insert(result, message)
    end
    while #result > limit do
        table.remove(result, 1)
    end
    return result
end`,
    checks: `local function join(list) return table.concat(list, "|") end
assert(join(candidate({}, "a", 3)) == "a")
assert(join(candidate({ "a" }, "b", 3)) == "a|b")
assert(join(candidate({ "a" }, "a", 3)) == "a")
assert(join(candidate({ "a", "b" }, "b", 3)) == "a|b")
assert(join(candidate({ "a", "b" }, "a", 3)) == "a|b|a")
assert(join(candidate({ "a", "b", "c" }, "d", 3)) == "b|c|d")
assert(join(candidate({ "a", "b", "c" }, "c", 3)) == "a|b|c")
assert(join(candidate({ "a", "b", "c", "d" }, "e", 2)) == "d|e")
assert(join(candidate({ "a", "b", "c", "d" }, "d", 2)) == "c|d")
assert(join(candidate({ "a", "b", "c" }, "d", 1)) == "d")
local source = { "a", "b" }
local result = candidate(source, "c", 5)
assert(result ~= source and #source == 2 and source[1] == "a")
result[1] = "changed"
assert(source[1] == "a")
for size = 0, 8 do
    local queue = {}
    for i = 1, size do table.insert(queue, "m" .. i) end
    local pushed = candidate(queue, "new", 4)
    assert(#pushed <= 4 and #pushed >= 1)
    assert(pushed[#pushed] == "new")
    assert(#pushed == math.min(size + 1, 4))
end
assert(candidate({ "a" }, "", 3) == nil)
assert(candidate({ "a" }, string.rep("x", 81), 3) == nil)
assert(candidate({ "a" }, 5, 3) == nil)
assert(candidate({ "a", "" }, "b", 3) == nil)
assert(candidate({ "a", 5 }, "b", 3) == nil)
assert(candidate({ "a" }, "b", 0) == nil)
assert(candidate({ "a" }, "b", 65) == nil)
assert(candidate({ "a" }, "b", 1.5) == nil)
assert(candidate({ "a" }, "b", 0/0) == nil)
assert(candidate({ [1] = "a", [3] = "b" }, "c", 3) == nil)
assert(candidate(setmetatable({ "a" }, {}), "b", 3) == nil)
assert(candidate("queue", "b", 3) == nil)`,
    mutation: ['while #result > limit do', 'while #result > limit + 1 do'],
  },
  {
    id: 'project-client-fields', family: 'contract-field-projection',
    prompt: 'Write a standalone Luau module returning project(record, allowed). record must be a plain table with no metatable and allowed a plain dense array with no metatable of unique nonempty string field names; anything else returns nil. Return a fresh table holding only those allowed fields that are present, plus the count of fields copied, skipping fields the record does not have. Refuse the whole projection, returning nil, when an allowed field holds a table, function, thread or userdata, because copying a reference would leak whatever it points at. This is pure outbound data shaping, not a RemoteEvent handler or persistent save.',
    source: denseArray + `return function(record, allowed)
    if type(record) ~= "table" or getmetatable(record) ~= nil then return nil end
    if not denseArray(allowed) then return nil end
    local seen = {}
    local result = {}
    local count = 0
    for i = 1, #allowed do
        local field = allowed[i]
        if type(field) ~= "string" or field == "" or seen[field] then return nil end
        seen[field] = true
        local value = record[field]
        local kind = type(value)
        if kind == "table" or kind == "function" or kind == "thread" or kind == "userdata" then return nil end
        if value ~= nil then
            result[field] = value
            count += 1
        end
    end
    return result, count
end`,
    checks: `local record = { id = "player-1", displayName = "Ann", coins = 40, sessionToken = "secret", banned = false }
local view, count = candidate(record, { "id", "displayName", "coins", "banned" })
assert(count == 4)
assert(view.id == "player-1" and view.displayName == "Ann" and view.coins == 40 and view.banned == false)
assert(view.sessionToken == nil)
assert(view ~= record)
local fields = 0
for _ in pairs(view) do fields += 1 end
assert(fields == 4)
view.coins = 999
assert(record.coins == 40)
local partial, partialCount = candidate(record, { "id", "missing" })
assert(partialCount == 1 and partial.id == "player-1" and partial.missing == nil)
local none, noneCount = candidate(record, { "absent" })
assert(noneCount == 0 and next(none) == nil)
local empty, emptyCount = candidate({}, {})
assert(emptyCount == 0 and next(empty) == nil)
assert(candidate(record, { "id", "id" }) == nil)
assert(candidate({ id = "x", position = { 1, 2 } }, { "id", "position" }) == nil)
assert(candidate({ id = "x", callback = function() return 1 end }, { "callback" }) == nil)
assert(candidate(record, { "id", "" }) == nil)
assert(candidate(record, { "id", 5 }) == nil)
assert(candidate(record, { [1] = "id", [3] = "coins" }) == nil)
assert(candidate(record, { "id", extra = "coins" }) == nil)
assert(candidate(record, setmetatable({ "id" }, {})) == nil)
assert(candidate(setmetatable({ id = "x" }, {}), { "id" }) == nil)
assert(candidate("record", { "id" }) == nil)
assert(candidate(record, "id") == nil)`,
    mutation: ['if kind == "table" or kind == "function" or kind == "thread" or kind == "userdata" then return nil end', 'if kind == "function" or kind == "thread" or kind == "userdata" then return nil end'],
  },
  {
    id: 'distribute-column-widths', family: 'ui-column-widths',
    prompt: 'Write a standalone Luau module returning distribute(total, weights). total must be a finite safe integer in [0, 1000000] and weights a plain dense array with no metatable of one to sixty-four finite strictly positive numbers with a finite positive sum; anything else returns nil. Return a fresh array of integer widths that sums to EXACTLY total: give each column the floor of its weighted share, then hand the remaining whole units one each to the columns with the largest fractional remainder, breaking ties by lower index. This is pure layout arithmetic, not a RemoteEvent handler or persistent save.',
    source: finiteNumber + safeInteger + denseArray + `return function(total, weights)
    if not integerValue(total) or total < 0 or total > 1000000 then return nil end
    if not denseArray(weights) or #weights < 1 or #weights > 64 then return nil end
    local sum = 0
    for i = 1, #weights do
        local weight = weights[i]
        if not finite(weight) or weight <= 0 then return nil end
        sum += weight
    end
    if not finite(sum) or sum <= 0 then return nil end
    local widths = {}
    local order = {}
    local used = 0
    for i = 1, #weights do
        local exact = total * weights[i] / sum
        local floored = math.floor(exact)
        widths[i] = floored
        used += floored
        table.insert(order, { index = i, remainder = exact - floored })
    end
    table.sort(order, function(a, b)
        if a.remainder ~= b.remainder then return a.remainder > b.remainder end
        return a.index < b.index
    end)
    local leftover = total - used
    for i = 1, math.min(leftover, #order) do
        widths[order[i].index] += 1
    end
    return widths
end`,
    checks: `local function join(list) return table.concat(list, "|") end
assert(join(candidate(10, { 1, 1 })) == "5|5")
assert(join(candidate(11, { 1, 1 })) == "6|5")
assert(join(candidate(10, { 1, 2 })) == "3|7")
assert(join(candidate(0, { 1, 1 })) == "0|0")
assert(join(candidate(7, { 1 })) == "7")
assert(join(candidate(10, { 1, 1, 1 })) == "4|3|3")
assert(join(candidate(100, { 1, 3 })) == "25|75")
assert(join(candidate(5, { 2, 2, 1 })) == "2|2|1")
local weights = { 1, 2, 3 }
for total = 0, 40 do
    local widths = candidate(total, weights)
    local sum = 0
    for i = 1, #widths do
        assert(widths[i] % 1 == 0 and widths[i] >= 0)
        local exact = total * weights[i] / 6
        assert(widths[i] >= math.floor(exact) and widths[i] <= math.floor(exact) + 1)
        sum += widths[i]
    end
    assert(sum == total)
    assert(#widths == 3)
end
local wide = {}
for i = 1, 64 do table.insert(wide, 1) end
local spread = candidate(100, wide)
local spreadSum = 0
for i = 1, 64 do spreadSum += spread[i] end
assert(spreadSum == 100 and #spread == 64)
assert(candidate(10, {}) == nil)
assert(candidate(10, { 0, 1 }) == nil)
assert(candidate(10, { -1, 1 }) == nil)
assert(candidate(10, { 1, 0/0 }) == nil)
assert(candidate(10, { 1, math.huge }) == nil)
assert(candidate(10, { 1, "2" }) == nil)
assert(candidate(-1, { 1 }) == nil)
assert(candidate(1.5, { 1 }) == nil)
assert(candidate(1000001, { 1 }) == nil)
assert(candidate(0/0, { 1 }) == nil)
assert(candidate(10, { [1] = 1, [3] = 1 }) == nil)
assert(candidate(10, setmetatable({ 1 }, {})) == nil)
assert(candidate(10, "weights") == nil)`,
    mutation: ['if a.remainder ~= b.remainder then return a.remainder > b.remainder end', 'if a.remainder ~= b.remainder then return a.remainder < b.remainder end'],
  },
];
