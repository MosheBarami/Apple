/** First-party UI state logic for Roblox creators. These families are disjoint from the pinned eval. */
export const UI_LOGIC_CURRICULUM_F = [
  {
    id: 'choose-enabled-tab', family: 'ui-tab-state',
    prompt: 'A game menu can disable tabs during a round. Write a standalone Luau module returning chooseTab(tabs, selectedId). tabs is an ordered array of {id = string, enabled = boolean}. Keep selectedId if that tab is enabled; otherwise choose the first enabled tab. Return nil when none is enabled. Do not change tabs.',
    source: `return function(tabs, selectedId)
    if type(tabs) ~= "table" then return nil end
    for _, tab in ipairs(tabs) do
        if tab.id == selectedId and tab.enabled then return tab.id end
    end
    for _, tab in ipairs(tabs) do
        if tab.enabled then return tab.id end
    end
    return nil
end`,
    checks: `local tabs = {{id="shop",enabled=false},{id="map",enabled=true},{id="bag",enabled=true}}
assert(candidate(tabs, "bag") == "bag")
assert(candidate(tabs, "shop") == "map")
assert(candidate(tabs, "missing") == "map")
assert(tabs[1].enabled == false and tabs[3].id == "bag")
assert(candidate({{id="a",enabled=false}}, "a") == nil)
assert(candidate({}, "a") == nil)`,
    mutation: ['if tab.enabled then return tab.id end', 'if not tab.enabled then return tab.id end'],
  },
  {
    id: 'cycle-focusable-button', family: 'ui-focus-navigation',
    prompt: 'A controller moves focus among menu buttons. Write a standalone Luau module returning nextFocus(enabled, current, direction). enabled is an array of booleans, current is a valid 1-based index, and direction is 1 or -1. Wrap around and skip disabled buttons. Return nil if all are disabled or inputs are invalid. Do not mutate enabled.',
    source: `return function(enabled, current, direction)
    if type(enabled) ~= "table" or #enabled == 0 or type(current) ~= "number"
        or current % 1 ~= 0 or current < 1 or current > #enabled
        or (direction ~= 1 and direction ~= -1) then return nil end
    for step = 1, #enabled do
        local index = ((current - 1 + direction * step) % #enabled) + 1
        if enabled[index] then return index end
    end
    return nil
end`,
    checks: `local buttons = {true,false,true,false}
assert(candidate(buttons, 1, 1) == 3)
assert(candidate(buttons, 3, 1) == 1)
assert(candidate(buttons, 1, -1) == 3)
assert(candidate({false,false}, 1, 1) == nil)
assert(candidate({true}, 1, 1) == 1)
assert(candidate(buttons, 0, 1) == nil and candidate(buttons, 1, 0) == nil)
assert(buttons[2] == false)`,
    mutation: ['if enabled[index] then return index end', 'if not enabled[index] then return index end'],
  },
  {
    id: 'toggle-leaderboard-sort', family: 'ui-sort-state',
    prompt: 'A leaderboard header changes sorting when pressed. Write a standalone Luau module returning sortState(currentKey, currentDirection, tappedKey). Only "name", "coins" and "wins" are valid keys. An invalid tappedKey returns nil. Tapping the current key flips "asc" and "desc"; tapping a new key selects "asc". Return key, direction. Do not use Roblox services.',
    source: `return function(currentKey, currentDirection, tappedKey)
    if tappedKey ~= "name" and tappedKey ~= "coins" and tappedKey ~= "wins" then return nil end
    if tappedKey == currentKey then
        if currentDirection == "asc" then return tappedKey, "desc" end
        return tappedKey, "asc"
    end
    return tappedKey, "asc"
end`,
    checks: `local k,d = candidate("coins","asc","coins")
assert(k == "coins" and d == "desc")
k,d = candidate("coins","desc","coins")
assert(k == "coins" and d == "asc")
k,d = candidate("coins","desc","wins")
assert(k == "wins" and d == "asc")
assert(candidate("coins","asc","gems") == nil)`,
    mutation: ['if currentDirection == "asc" then return tappedKey, "desc" end', 'if currentDirection == "asc" then return tappedKey, "asc" end'],
  },
  {
    id: 'shop-button-affordance', family: 'ui-shop-action-state',
    prompt: 'A shop button must say why it cannot be pressed. Write a standalone Luau module returning buttonState(coins, price, stock, owned). Numeric inputs must be finite nonnegative numbers and owned must be boolean; invalid inputs return nil. Return "owned" first if already owned, else "sold-out" if stock is 0, else "buy" if coins cover price, otherwise "need-coins". Do not change any values.',
    source: `local function valid(n)
    return type(n) == "number" and n == n and n >= 0 and n < math.huge
end
return function(coins, price, stock, owned)
    if not valid(coins) or not valid(price) or not valid(stock) or type(owned) ~= "boolean" then return nil end
    if owned then return "owned" end
    if stock == 0 then return "sold-out" end
    if coins >= price then return "buy" end
    return "need-coins"
end`,
    checks: `assert(candidate(10,10,1,false) == "buy")
assert(candidate(9,10,1,false) == "need-coins")
assert(candidate(100,10,0,false) == "sold-out")
assert(candidate(0,10,0,true) == "owned")
assert(candidate(0,0,1,false) == "buy")
assert(candidate(-1,10,1,false) == nil and candidate(1,0/0,1,false) == nil)
assert(candidate(1,1,1,"false") == nil)`,
    mutation: ['if coins >= price then return "buy" end', 'if coins > price then return "buy" end'],
  },
  {
    id: 'move-panel-to-front', family: 'ui-panel-stack',
    prompt: 'A game has a stack of open panel ids. Write a standalone Luau module returning updatePanels(stack, action, id). For "open", remove any earlier occurrence of id and append it once at the frontmost end. For "close", remove id. Unknown actions or non-string ids return nil. Return a new array without changing stack.',
    source: `return function(stack, action, id)
    if type(stack) ~= "table" or type(id) ~= "string" or (action ~= "open" and action ~= "close") then return nil end
    local out = {}
    for _, old in ipairs(stack) do
        if old ~= id then out[#out + 1] = old end
    end
    if action == "open" then out[#out + 1] = id end
    return out
end`,
    checks: `local original = {"map","shop","bag"}
local a = candidate(original,"open","shop")
assert(#a == 3 and a[1] == "map" and a[2] == "bag" and a[3] == "shop")
local b = candidate(original,"close","shop")
assert(#b == 2 and b[1] == "map" and b[2] == "bag")
local c = candidate(original,"open","settings")
assert(#c == 4 and c[4] == "settings")
assert(#original == 3 and original[2] == "shop")
assert(candidate(original,"hide","shop") == nil)`,
    mutation: ['if old ~= id then out[#out + 1] = old end', 'if old == id then out[#out + 1] = old end'],
  },
  {
    id: 'advance-help-tour', family: 'ui-help-tour-state',
    prompt: 'A first-run help tour has steps 1..count, with 0 meaning hidden. Write a standalone Luau module returning tourStep(step, count, action). "reset" shows step 1; "skip" hides it; "next" advances or hides after the last step; "back" moves back but never below 1. Invalid step, count or action returns nil. Inputs are integers with count at least 1 and step from 0 to count.',
    source: `return function(step, count, action)
    if type(step) ~= "number" or type(count) ~= "number" or step % 1 ~= 0 or count % 1 ~= 0
        or count < 1 or step < 0 or step > count then return nil end
    if action == "reset" then return 1 end
    if action == "skip" then return 0 end
    if step == 0 then return 0 end
    if action == "next" then
        if step >= count then return 0 end
        return step + 1
    end
    if action == "back" then return math.max(1, step - 1) end
    return nil
end`,
    checks: `assert(candidate(1,3,"next") == 2)
assert(candidate(3,3,"next") == 0)
assert(candidate(1,3,"back") == 1)
assert(candidate(2,3,"back") == 1)
assert(candidate(0,3,"reset") == 1)
assert(candidate(2,3,"skip") == 0)
assert(candidate(0,3,"next") == 0)
assert(candidate(4,3,"next") == nil and candidate(1,3,"unknown") == nil)`,
    mutation: ['if step >= count then return 0 end', 'if step >= count then return 1 end'],
  },
  {
    id: 'validate-player-title', family: 'ui-name-validation',
    prompt: 'A player may set a short display title. Write a standalone Luau module returning titleError(name). Valid titles have 3 to 20 ASCII characters, start with a letter, and then contain only letters, digits or underscore. Return nil when valid; otherwise return "length", "first-letter" or "characters" in that priority order. A non-string value returns "length".',
    source: `return function(name)
    if type(name) ~= "string" or #name < 3 or #name > 20 then return "length" end
    if not string.match(name, "^[A-Za-z]") then return "first-letter" end
    if not string.match(name, "^[A-Za-z][A-Za-z0-9_]*$") then return "characters" end
    return nil
end`,
    checks: `assert(candidate("Ab3") == nil)
assert(candidate("Player_One") == nil)
assert(candidate("AB") == "length")
assert(candidate("123Alice") == "first-letter")
assert(candidate("Alex!") == "characters")
assert(candidate(string.rep("A",21)) == "length")
assert(candidate(17) == "length")`,
    mutation: ['#name < 3 or #name > 20', '#name <= 3 or #name > 20'],
  },
  {
    id: 'replace-conflicting-keybind', family: 'ui-keybind-assignment',
    prompt: 'A keybinding screen assigns one keyboard key to one action at a time. Write a standalone Luau module returning assignKey(bindings, action, key). bindings maps action names to keys. Remove any other action already using key, then assign action to key. Return a new map and displaced action name (or nil). Invalid non-string action/key or non-table bindings returns nil. Do not mutate bindings.',
    source: `return function(bindings, action, key)
    if type(bindings) ~= "table" or type(action) ~= "string" or type(key) ~= "string" then return nil end
    local out = {}
    local displaced = nil
    for a, k in pairs(bindings) do
        if k == key and a ~= action then
            displaced = a
        elseif a ~= action then
            out[a] = k
        end
    end
    out[action] = key
    return out, displaced
end`,
    checks: `local old = {jump="Space",dash="Q",map="M"}
local b, displaced = candidate(old,"dash","Space")
assert(displaced == "jump" and b.jump == nil and b.dash == "Space" and b.map == "M")
assert(old.jump == "Space" and old.dash == "Q")
local c, none = candidate(old,"dash","E")
assert(none == nil and c.jump == "Space" and c.dash == "E")
assert(candidate(old,3,"X") == nil)`,
    mutation: ['if k == key and a ~= action then', 'if k == key and a == action then'],
  },
  {
    id: 'pick-pinned-quest', family: 'ui-quest-pin',
    prompt: 'A quest tracker shows one pinned unfinished quest. Write a standalone Luau module returning pinnedQuest(quests). Each quest is {id = string, pinned = boolean, complete = boolean, priority = number}. Return the id with the highest priority among pinned unfinished quests; on a tie keep the earlier array entry. Return nil if none qualify. Do not reorder or change quests.',
    source: `return function(quests)
    if type(quests) ~= "table" then return nil end
    local best = nil
    for _, q in ipairs(quests) do
        if q.pinned and not q.complete then
            if best == nil or q.priority > best.priority then best = q end
        end
    end
    return best and best.id or nil
end`,
    checks: `local quests = {{id="a",pinned=true,complete=false,priority=2},{id="b",pinned=true,complete=false,priority=7},{id="c",pinned=true,complete=false,priority=7},{id="d",pinned=false,complete=false,priority=99}}
assert(candidate(quests) == "b")
assert(candidate({{id="done",pinned=true,complete=true,priority=9}}) == nil)
assert(candidate({}) == nil)
assert(quests[1].id == "a" and quests[2].priority == 7)`,
    mutation: ['q.priority > best.priority', 'q.priority < best.priority'],
  },
];
