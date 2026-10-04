-- Behavioral double only: not Roblox layout, rendering, input routing or engine API validation.
local function signal()
    local handlers = {}
    local event = {}
    function event:Connect(fn)
        local connection = { Connected = true }
        function connection:Disconnect() self.Connected = false end
        table.insert(handlers, { fn = fn, connection = connection })
        return connection
    end
    function event:Fire(...)
        for _, handler in ipairs(handlers) do
            if handler.connection.Connected then handler.fn(...) end
        end
    end
    function event:count()
        local count = 0
        for _, handler in ipairs(handlers) do if handler.connection.Connected then count += 1 end end
        return count
    end
    return event
end

Enum = setmetatable({}, { __index = function(_, category)
    return setmetatable({}, { __index = function(_, value) return category .. "." .. value end })
end })
-- Color3 keeps its array shape (existing assertions index it positionally) AND gains R/G/B,
-- because the kit's button bevel reads them to derive a lighter top and a darker bottom edge.
-- A stub that models only the constructor cannot exercise code that reads the value back.
Color3 = {
	new = function(r, g, b) return { r, g, b, R = r or 0, G = g or 0, B = b or 0 } end,
	fromRGB = function(r, g, b) return { r, g, b, R = (r or 0) / 255, G = (g or 0) / 255, B = (b or 0) / 255 } end,
}
ColorSequenceKeypoint = { new = function(t, colour) return { Time = t, Value = colour } end }
ColorSequence = { new = function(keypoints) return { Keypoints = keypoints } end }
UDim = { new = function(...) return { ... } end }
-- UDim2 AND Vector2 CARRY THEIR FIELDS AS WELL AS THEIR ARGUMENTS.
--
-- These returned a bare positional table, so nothing in a test could ask a size what its height
-- was: `panel.Size.Y.Offset` — which is how Roblox spells it and how every reader expects to — read
-- nil. A fixture that cannot answer the question the engine answers pushes every assertion into
-- `size[3]`, and an assertion written as `size[3]` is one nobody can check by reading.
--
-- The positional keys stay, so anything already indexing them is untouched; the named fields are
-- added beside them. Deliberately NOT a metatable: this is a stub, and a stub that computes is a
-- stub that can be wrong in a way the real thing is not.
UDim2 = {
    new = function(xs, xo, ys, yo)
        return { xs, xo, ys, yo, X = { Scale = xs, Offset = xo }, Y = { Scale = ys, Offset = yo } }
    end,
    fromOffset = function(x, y)
        return { x, y, X = { Scale = 0, Offset = x }, Y = { Scale = 0, Offset = y } }
    end,
    fromScale = function(x, y)
        return { x, y, X = { Scale = x, Offset = 0 }, Y = { Scale = y, Offset = 0 } }
    end,
}
Vector2 = { new = function(x, y) return { x, y, X = x, Y = y } end }
TweenInfo = { new = function(...) return { ... } end }
local services = {
    RunService = { IsClient = function() return true end, Heartbeat = signal() },
    GuiService = {},
    UserInputService = { InputBegan = signal(), GamepadEnabled = false },
    TweenService = { plays = 0, cancels = 0 },
}
function services.TweenService:Create(target, _info, values)
    return {
        Play = function()
            services.TweenService.plays += 1
            for key, value in pairs(values) do target[key] = value end
        end,
        Cancel = function() services.TweenService.cancels += 1 end,
    }
end
game = { GetService = function(_, name) assert(services[name], name); return services[name] end }
Instance = {}
function Instance.new(className)
    local propertySignals = {}
    -- THE POINTER SIGNALS A REAL GuiButton HAS, and this fixture did not.
    --
    -- It gave every instance `Activated` and `Destroying` and nothing else, so the moment the kit
    -- connected a pressed state the whole suite failed with "attempt to index nil with 'Connect'" —
    -- not because the kit was wrong but because the model of Roblox was thinner than Roblox. A
    -- fixture missing a signal the engine has cannot tell "this code is broken" from "this code
    -- uses something I have not heard of", and it reports the second as the first.
    --
    -- These four are on every GuiButton (create.roblox.com/docs/reference/engine/classes/GuiButton).
    -- They are added to EVERY instance rather than to buttons only, which is the fixture already
    -- being loose in the same way it is loose about Activated — worth knowing, not worth fixing
    -- here, because a test that connects MouseLeave on a Frame is a test with a different problem.
    local data = { ClassName = className, Name = className, children = {},
        Activated = signal(), Destroying = signal(),
        MouseButton1Down = signal(), MouseButton1Up = signal(), MouseEnter = signal(), MouseLeave = signal(),
        AbsoluteSize = {X=0,Y=0} }
    local object = {}
    function data:GetPropertyChangedSignal(property)
        if not propertySignals[property] then propertySignals[property] = signal() end
        return propertySignals[property]
    end
    function data:IsA(kind) return className == kind end
    function data:FindFirstChild(name)
        for _, child in ipairs(data.children) do if child.Name == name then return child end end
        return nil
    end
    function data:IsDescendantOf(ancestor)
        local at = data.Parent
        while at do
            if at == ancestor then return true end
            at = at.Parent
        end
        return false
    end
    function data:Destroy()
        data.Destroying:Fire()
        local children = table.clone(data.children)
        for _, child in ipairs(children) do child:Destroy() end
        object.Parent = nil
        data.destroyed = true
    end
    setmetatable(object, {
        __index = function(_, key) return data[key] end,
        __newindex = function(_, key, value)
            assert(not data.destroyed, "write after destroy: " .. key)
            if key == "Parent" then
                if data.Parent then
                    local i = table.find(data.Parent.children, object)
                    if i then table.remove(data.Parent.children, i) end
                end
                if value then table.insert(value.children, object) end
            end
            data[key] = value
            if propertySignals[key] then propertySignals[key]:Fire() end
        end,
    })
    return object
end
local function find(root, name)
    if root.Name == name then return root end
    for _, child in ipairs(root.children) do
        local match = find(child, name)
        if match then return match end
    end
    return nil
end
local playerGui = Instance.new("PlayerGui")
