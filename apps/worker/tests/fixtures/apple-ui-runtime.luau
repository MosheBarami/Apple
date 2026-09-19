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
UDim2 = { new = function(...) return { ... } end, fromOffset = function(...) return { ... } end, fromScale = function(...) return { ... } end }
Vector2 = { new = function(...) return { ... } end }
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
    local data = { ClassName = className, Name = className, children = {}, Activated = signal(), Destroying = signal(), AbsoluteSize = {X=0,Y=0} }
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
