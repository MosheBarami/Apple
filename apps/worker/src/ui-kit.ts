// First-party Roblox UI source, installed through the same reviewed edit_script path as prefabs.
// Engine references: create.roblox.com/docs/ui/on-screen-containers,
// /ui/size-modifiers, /tutorials/building/ui/interactive-buttons.
// This is presentation, never purchase authority. Studio rendering remains a separate live gate.
import { appleUIThemeSource } from './ui-kit-themes';

export const APPLE_UI_SOURCE = `--!nonstrict
-- AppleUI: HUD, objectives, notifications and shop. Require from a LocalScript after PlayerGui exists.
-- onRequest receives ONLY an item id. The server must validate ownership, price and balance.
-- Return true only after a server acknowledgement. This module never grants or charges anything.
local AppleUI = {}
${appleUIThemeSource()}

function AppleUI.mount(playerGui, options)
    options = options or {}
    assert(type(options) == "table" and getmetatable(options) == nil, "AppleUI options must be a plain record")
    local themeId = options.theme or "studio"
    assert(type(themeId) == "string" and THEMES[themeId], "Unknown AppleUI theme")
    local theme = THEMES[themeId]
    assert(options.accent == nil or typeof(options.accent) == "Color3", "accent must be a Color3")
    assert(game:GetService("RunService"):IsClient(), "AppleUI must run on the client")
    assert(playerGui and playerGui:IsA("PlayerGui"), "AppleUI needs a PlayerGui")
    local name = options.name or "AppleUI"
    assert(type(name) == "string" and #name > 0, "AppleUI needs a nonempty name")
    assert(not playerGui:FindFirstChild(name), "AppleUI already exists; destroy the old controller first")
    assert(options.onRequest == nil or type(options.onRequest) == "function", "onRequest must be a function")

    local GuiService = game:GetService("GuiService")
    local Input = game:GetService("UserInputService")
    local TweenService = game:GetService("TweenService")
    local accent = options.accent or theme.accent
    local ink, muted, surface = theme.ink, theme.muted, theme.panel
    local connections, itemConnections, cards, objectiveCards = {}, {}, {}, {}
    local notices, noticeRemaining, noticeTween = {}, 0, nil
    local alive, busy, opened = true, false, false
    local previousSelection, openTween
    local api = { themeId = themeId }
    local showShop = options.showShop ~= false

    local function text(value, limit)
        if value == nil then return "—" end
        local value_ = tostring(value)
        local length = utf8.len(value_)
        if not length then return "Invalid text" end
        local boundary = utf8.offset(value_, (limit or 160) + 1)
        return boundary and string.sub(value_, 1, boundary - 1) or value_
    end
    local function arrayLength(value, limit)
        assert(type(value) == "table" and getmetatable(value) == nil, "Expected a plain array")
        local count = 0
        for key in pairs(value) do
            assert(type(key) == "number" and key >= 1 and key <= limit and key % 1 == 0, "Invalid array index")
            count += 1
        end
        assert(count <= limit, "Too many entries")
        for index = 1, count do assert(rawget(value, index) ~= nil, "Sparse arrays are not supported") end
        return count
    end
    local function progressNumber(value)
        return type(value) == "number" and value == value and value >= 0 and value <= 1000000000
    end
    local function make(className, parent, props)
        local object = Instance.new(className)
        for key, value in pairs(props or {}) do object[key] = value end
        object.Parent = parent
        return object
    end
    local function round(object, radius)
        make("UICorner", object, { CornerRadius = UDim.new(0, radius or 12) })
    end
    local function outline(object, thickness, colour)
        return make("UIStroke", object, { Color = colour or theme.edge,
            Thickness = thickness or theme.stroke, ApplyStrokeMode = Enum.ApplyStrokeMode.Border })
    end
    local function label(parent, name_, value, size, position, dimensions)
        return make("TextLabel", parent, {
            Name = name_, Text = text(value), TextSize = size, Font = Enum.Font.Gotham,
            TextColor3 = ink, BackgroundTransparency = 1, RichText = false,
            TextWrapped = true, TextXAlignment = Enum.TextXAlignment.Left,
            Position = position, Size = dimensions,
        })
    end
    local function button(parent, name_, value, position, dimensions)
        local object = make("TextButton", parent, {
            Name = name_, Text = text(value), TextSize = 16, Font = theme.titleFont,
            TextColor3 = theme.accentInk, BackgroundColor3 = accent,
            BorderSizePixel = 0, RichText = false, TextWrapped = true,
            Position = position, Size = dimensions, AutoButtonColor = true, Selectable = true,
        })
        round(object, math.min(theme.radius, 10))
        if theme.stroke > 1 then outline(object, theme.stroke) end
        return object
    end
    local ICONS = { coin = true, gem = true, shield = true, bolt = true, crate = true }
    local function glyph(parent, kind, position, dimensions)
        local holder = make("Frame", parent, { Name = "ItemGlyph", BackgroundTransparency = 1,
            Position = position, Size = dimensions })
        local plate = make("Frame", holder, { Name = "GlyphPlate", AnchorPoint = Vector2.new(0.5, 0.5),
            Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromScale(0.72, 0.72),
            BackgroundColor3 = accent, BorderSizePixel = 0 })
        if kind == "coin" then
            round(plate, 100); outline(plate, 3)
            local ring = make("Frame", plate, { Size = UDim2.fromScale(0.68, 0.68), Position = UDim2.fromScale(0.16, 0.16),
                BackgroundTransparency = 1, BorderSizePixel = 0 }); round(ring, 100); outline(ring, 2, theme.accentInk)
            local mark = label(plate, "GlyphMark", "C", 22, UDim2.fromScale(0, 0), UDim2.fromScale(1, 1))
            mark.TextXAlignment = Enum.TextXAlignment.Center; mark.Font = theme.titleFont; mark.TextColor3 = theme.accentInk
        elseif kind == "gem" then
            plate.Rotation = 45; round(plate, 6); outline(plate, 3)
            make("Frame", plate, { Name = "Facet", Position = UDim2.fromScale(0.12, 0.12), Size = UDim2.fromScale(0.42, 0.22),
                BackgroundColor3 = Color3.new(1, 1, 1), BackgroundTransparency = 0.35, BorderSizePixel = 0 })
        elseif kind == "bolt" then
            plate.BackgroundTransparency = 1
            make("Frame", plate, { Name = "UpperBolt", Position = UDim2.fromScale(0.3, 0.05), Size = UDim2.fromScale(0.38, 0.55),
                Rotation = 30, BackgroundColor3 = accent, BorderSizePixel = 0 })
            make("Frame", plate, { Name = "LowerBolt", Position = UDim2.fromScale(0.32, 0.43), Size = UDim2.fromScale(0.38, 0.55),
                Rotation = 30, BackgroundColor3 = accent, BorderSizePixel = 0 })
            make("Frame", plate, { Name = "BoltJoin", Position = UDim2.fromScale(0.13, 0.42), Size = UDim2.fromScale(0.72, 0.16),
                BackgroundColor3 = accent, BorderSizePixel = 0 })
        elseif kind == "shield" then
            round(plate, 7); outline(plate, 3)
            make("Frame", plate, { Name = "ShieldStripe", Position = UDim2.fromScale(0.42, 0.12), Size = UDim2.fromScale(0.16, 0.7),
                BackgroundColor3 = theme.accentInk, BorderSizePixel = 0 })
            local point = make("Frame", plate, { Position = UDim2.fromScale(0.25, 0.6), Size = UDim2.fromScale(0.5, 0.5),
                Rotation = 45, BackgroundColor3 = accent, BorderSizePixel = 0 }); round(point, 3)
        else
            round(plate, 7); outline(plate, 3)
            make("Frame", plate, { Name = "CrateBand", Position = UDim2.fromScale(0.4, 0), Size = UDim2.fromScale(0.2, 1),
                BackgroundColor3 = theme.accentInk, BackgroundTransparency = 0.22, BorderSizePixel = 0 })
            make("Frame", plate, { Name = "CrateSeam", Position = UDim2.fromScale(0, 0.28), Size = UDim2.fromScale(1, 0.08),
                BackgroundColor3 = theme.accentInk, BackgroundTransparency = 0.22, BorderSizePixel = 0 })
        end
        return holder
    end
    local function listen(signal, callback, bucket)
        table.insert(bucket or connections, signal:Connect(callback))
    end
    local function disconnect(bucket)
        for _, connection in ipairs(bucket) do connection:Disconnect() end
        table.clear(bucket)
    end

    local gui = make("ScreenGui", playerGui, {
        Name = name, ResetOnSpawn = false, ScreenInsets = Enum.ScreenInsets.CoreUISafeInsets,
        ZIndexBehavior = Enum.ZIndexBehavior.Sibling, DisplayOrder = options.displayOrder or 10,
    })
    local hud = make("Frame", gui, {
        Name = "HUD", AnchorPoint = Vector2.new(theme.hudSide == "left" and 0 or 1, 0),
        Position = UDim2.new(theme.hudSide == "left" and 0 or 1, theme.hudSide == "left" and 16 or -16, 0, 16),
        Size = UDim2.new(0.8, 0, 0, showShop and 126 or 70), BackgroundColor3 = surface, BorderSizePixel = 0,
    })
    make("UISizeConstraint", hud, { MaxSize = Vector2.new(260, 126) })
    round(hud, theme.radius); outline(hud)
    glyph(hud, theme.iconStyle, UDim2.fromOffset(12, 13), UDim2.fromOffset(42, 42))
    local balanceLabel = label(hud, "BalanceLabel", options.balanceLabel or theme.currencyLabel, 11, UDim2.fromOffset(64, 13), UDim2.new(1, -80, 0, 16))
    balanceLabel.TextColor3 = theme.panelMuted; balanceLabel.Font = theme.titleFont
    local balance = label(hud, "Balance", options.balance, 22, UDim2.fromOffset(64, 29), UDim2.new(1, -80, 0, 30))
    balance.TextColor3 = theme.panelInk; balance.Font = theme.titleFont
    local launch = button(hud, "OpenShop", options.shopButtonLabel or "Shop", UDim2.fromOffset(14, 68), UDim2.new(1, -28, 0, 44))
    launch.Visible = showShop

    -- Objectives are opt-in, below the HUD, and bounded/scrollable on small viewports.
    local objectives = make("ScrollingFrame", gui, {
        Name = "Objectives", AnchorPoint = Vector2.new(1, 0),
        Position = UDim2.new(1, -16, 0, showShop and 158 or 102),
        Size = UDim2.new(0.8, 0, 0.26, 0), Visible = false,
        BackgroundColor3 = surface, BorderSizePixel = 0, CanvasSize = UDim2.fromOffset(0, 0),
        AutomaticCanvasSize = Enum.AutomaticSize.Y, ScrollBarThickness = 4,
        ScrollingDirection = Enum.ScrollingDirection.Y, ScrollBarImageColor3 = accent,
    })
    make("UISizeConstraint", objectives, { MaxSize = Vector2.new(260, 260) })
    round(objectives, math.min(theme.radius, 12)); outline(objectives)
    make("UIListLayout", objectives, { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder })

    -- One finite queue, one clock connection. Notices never take keyboard/gamepad focus.
    local notice = make("Frame", gui, {
        Name = "Notification", AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -24),
        Size = UDim2.new(0.9, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y,
        BackgroundColor3 = surface, BorderSizePixel = 0,
        Visible = false, Active = false,
    })
    make("UISizeConstraint", notice, { MaxSize = Vector2.new(480, 10000) })
    make("UIPadding", notice, { PaddingTop = UDim.new(0, 12), PaddingBottom = UDim.new(0, 12), PaddingLeft = UDim.new(0, 16), PaddingRight = UDim.new(0, 16) })
    make("UIListLayout", notice, { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder })
    round(notice, 14)
    local noticeScale = make("UIScale", notice, { Scale = 1 })
    local noticeKind = label(notice, "NotificationKind", "", 13, UDim2.fromOffset(0, 0), UDim2.new(1, 0, 0, 20))
    noticeKind.LayoutOrder = 1
    local noticeText = label(notice, "NotificationText", "", 16, UDim2.fromOffset(0, 0), UDim2.new(1, 0, 0, 0))
    noticeText.AutomaticSize = Enum.AutomaticSize.Y
    noticeText.TextColor3 = theme.panelInk
    noticeText.LayoutOrder = 2
    local noticeStyles = {
        info = { title = "Info", color = theme.panelInk },
        success = { title = "Confirmed", color = accent },
        error = { title = "Not completed", color = theme.danger },
    }
    local function showNotice()
        if noticeTween then noticeTween:Cancel(); noticeTween = nil end
        local entry = notices[1]
        notice.Visible = entry ~= nil and not opened
        noticeRemaining = entry and entry.duration or 0
        if not entry then return end
        noticeKind.Text = noticeStyles[entry.kind].title
        noticeKind.TextColor3 = noticeStyles[entry.kind].color
        noticeText.Text = entry.message
        noticeScale.Scale = 1
        if not options.reducedMotion and not opened then
            noticeScale.Scale = 0.97
            noticeTween = TweenService:Create(noticeScale, TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = 1 })
            noticeTween:Play()
        end
    end
    function api:notify(message, kind, duration)
        if not alive then return false end
        kind, duration = kind or "info", duration or 5
        assert(type(message) == "string" and #message > 0 and utf8.len(message), "Notification needs valid text")
        assert(noticeStyles[kind] ~= nil, "Unknown notification kind")
        assert(type(duration) == "number" and duration == duration and duration >= 2 and duration <= 12, "Duration must be 2–12 seconds")
        if #notices >= 5 then return false end
        table.insert(notices, { message = text(string.gsub(message, "%s+", " "), 160), kind = kind, duration = duration })
        if #notices == 1 then showNotice() end
        return true
    end
    function api:clearNotifications()
        if not alive then return false end
        table.clear(notices)
        showNotice()
        return true
    end
    listen(game:GetService("RunService").Heartbeat, function(delta)
        if not alive or opened or #notices == 0 or not progressNumber(delta) then return end
        noticeRemaining -= delta
        if noticeRemaining <= 0 then table.remove(notices, 1); showNotice() end
    end)
    function api:setObjectives(entries)
        if not alive then return false end
        arrayLength(entries, 8)
        local seen, clean = {}, {}
        for _, entry in ipairs(entries) do
            assert(type(entry) == "table" and getmetatable(entry) == nil, "Objective needs a plain record")
            assert(type(entry.id) == "string" and #entry.id > 0 and #entry.id <= 100 and not seen[entry.id], "Objective needs a unique id")
            assert(type(entry.title) == "string" and #entry.title > 0 and utf8.len(entry.title), "Objective needs valid text")
            assert(entry.completed == nil or type(entry.completed) == "boolean", "completed must be explicit boolean")
            local known = entry.current ~= nil or entry.target ~= nil
            assert(not known or (progressNumber(entry.current) and progressNumber(entry.target) and entry.target > 0 and entry.current <= entry.target), "Invalid objective progress")
            seen[entry.id] = true
            table.insert(clean, { title = text(entry.title, 80), current = entry.current, target = entry.target, completed = entry.completed == true })
        end
        -- Invalid replacement cannot erase the previous observed objective state.
        for _, card in ipairs(objectiveCards) do card:Destroy() end
        table.clear(objectiveCards)
        objectives.Visible = #clean > 0 and not opened
        objectives.CanvasPosition = Vector2.new(0, 0)
        for index, entry in ipairs(clean) do
            local row = make("Frame", objectives, { Name = "Objective_" .. index, LayoutOrder = index,
                Size = UDim2.new(1, -8, 0, 0), AutomaticSize = Enum.AutomaticSize.Y,
                BackgroundColor3 = theme.card, BorderSizePixel = 0 })
            round(row, math.min(theme.radius, 10))
            table.insert(objectiveCards, row)
            make("UIPadding", row, { PaddingTop = UDim.new(0, 10), PaddingBottom = UDim.new(0, 10), PaddingLeft = UDim.new(0, 12), PaddingRight = UDim.new(0, 12) })
            make("UIListLayout", row, { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder })
            local title = label(row, "ObjectiveTitle", entry.title, 15, UDim2.fromOffset(0, 0), UDim2.new(1, 0, 0, 0))
            title.AutomaticSize = Enum.AutomaticSize.Y
            title.LayoutOrder = 1
            local caption = entry.completed and "Completed" or (entry.current ~= nil and (tostring(entry.current) .. " / " .. tostring(entry.target)) or "Progress unavailable")
            local detail = label(row, "ObjectiveProgress", caption, 13, UDim2.fromOffset(0, 0), UDim2.new(1, 0, 0, 22))
            detail.LayoutOrder = 2
            detail.TextColor3 = entry.completed and accent or muted
            local track = make("Frame", row, { Name = "ProgressTrack", Position = UDim2.fromOffset(12, 86),
                Size = UDim2.new(1, 0, 0, 4), LayoutOrder = 3, BorderSizePixel = 0, BackgroundColor3 = Color3.fromRGB(62, 67, 64),
                Visible = entry.current ~= nil })
            round(track, 2)
            local fill = make("Frame", track, { Name = "ProgressFill", Size = UDim2.fromScale(entry.current and entry.current / entry.target or 0, 1),
                BackgroundColor3 = accent, BorderSizePixel = 0 })
            round(fill, 2)
        end
        return true
    end

    local overlay = make("Frame", gui, {
        Name = "ShopOverlay", Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1,
        Visible = false, ZIndex = 2,
    })
    local backdrop = make("TextButton", overlay, {
        Name = "Dismiss", Text = "", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0),
        BackgroundTransparency = 0.3, BorderSizePixel = 0, Selectable = false, AutoButtonColor = false,
    })
    local panel = make("Frame", overlay, {
        Name = "Shop", AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5),
        Size = UDim2.fromScale(0.92, 0.88), BackgroundColor3 = surface, BorderSizePixel = 0,
        Active = true, ZIndex = 2,
    })
    round(panel, theme.radius)
    make("UISizeConstraint", panel, { MaxSize = Vector2.new(theme.layout == "cards" and 740 or 620, 650) })
    outline(panel)
    local scale = make("UIScale", panel, { Scale = 1 })
    local title = label(panel, "Title", options.title or theme.shopLabel, theme.titleSize, UDim2.fromOffset(24, 18), UDim2.new(1, -120, 0, 44))
    title.Font = theme.titleFont; title.TextColor3 = theme.panelInk
    local close = button(panel, "CloseShop", "Close", UDim2.new(1, -88, 0, 18), UDim2.fromOffset(64, 44))
    local list = make("ScrollingFrame", panel, {
        Name = "Items", Position = UDim2.fromOffset(20, 82), Size = UDim2.new(1, -40, 1, -160),
        BackgroundTransparency = 1, BorderSizePixel = 0, CanvasSize = UDim2.fromOffset(0, 0),
        AutomaticCanvasSize = Enum.AutomaticSize.Y, ScrollBarThickness = 4,
        ScrollingDirection = Enum.ScrollingDirection.Y, ScrollBarImageColor3 = accent,
    })
    -- Size to the catalogue, not a mostly-empty full-height sheet. Large/narrow catalogues still
    -- scroll, and the measured safe viewport remains the upper bound in landscape layouts.
    local columns = 1
    local function fitPanelHeight()
        local rows = theme.layout == "cards" and math.ceil(#cards / columns) or #cards
        local content = rows > 0 and (rows * theme.cardHeight + math.max(0, rows - 1) * 12) or 64
        local height = math.min(650, math.max(224, content + 160))
        local available = overlay.AbsoluteSize.Y
        if available > 0 then height = math.min(height, math.floor(available * 0.88)) end
        panel.Size = UDim2.new(0.92, 0, 0, height)
    end
    listen(overlay:GetPropertyChangedSignal("AbsoluteSize"), fitPanelHeight)
    if theme.layout == "cards" then
        local grid = make("UIGridLayout", list, { Name = "CardGrid", CellPadding = UDim2.fromOffset(12, 12),
            CellSize = UDim2.new(0.5, -10, 0, theme.cardHeight), SortOrder = Enum.SortOrder.LayoutOrder,
            FillDirectionMaxCells = 2, HorizontalAlignment = Enum.HorizontalAlignment.Center })
        local function fitGrid()
            local width = list.AbsoluteSize.X
            columns = width >= 420 and 2 or 1
            grid.FillDirectionMaxCells = columns
            grid.CellSize = UDim2.new(1 / columns, columns == 2 and -10 or -8, 0, theme.cardHeight)
            fitPanelHeight()
        end
        listen(list:GetPropertyChangedSignal("AbsoluteSize"), fitGrid)
        fitGrid()
    else
        make("UIListLayout", list, { Padding = UDim.new(0, 12), SortOrder = Enum.SortOrder.LayoutOrder })
    end
    local empty = label(panel, "Empty", "No items available yet.", 16, UDim2.fromOffset(24, 100), UDim2.new(1, -48, 0, 64))
    empty.TextColor3 = theme.panelMuted
    local status = label(panel, "Status", "", 14, UDim2.new(0, 20, 1, -68), UDim2.new(1, -40, 0, 52))
    status.TextColor3 = theme.panelMuted

    local function refreshButtons()
        for _, card in ipairs(cards) do
            local enabled = not busy and not card.disabled and options.onRequest ~= nil
            card.button.Active = enabled
            card.button.Selectable = enabled
            card.button.AutoButtonColor = enabled
            card.button.BackgroundTransparency = enabled and 0 or 0.55
        end
    end
    local function restoreSelection()
        local selected = GuiService.SelectedObject
        if selected and selected:IsDescendantOf(overlay) then
            GuiService.SelectedObject = previousSelection and previousSelection.Parent and previousSelection or nil
        end
        previousSelection = nil
    end
    function api:open()
        if not alive or opened then return false end
        opened = true
        previousSelection = GuiService.SelectedObject
        overlay.Visible = true
        objectives.Visible = false
        notice.Visible = false
        launch.Selectable = false
        if Input.GamepadEnabled then GuiService.SelectedObject = close end
        if openTween then openTween:Cancel() end
        if not options.reducedMotion then
            scale.Scale = 0.97
            openTween = TweenService:Create(scale, TweenInfo.new(0.18, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = 1 })
            openTween:Play()
        else scale.Scale = 1 end
        return true
    end
    function api:close()
        if not alive or not opened then return false end
        opened = false
        restoreSelection()
        overlay.Visible = false
        objectives.Visible = #objectiveCards > 0
        notice.Visible = #notices > 0
        launch.Selectable = true
        if openTween then openTween:Cancel(); openTween = nil end
        return true
    end
    function api:setBalance(value)
        if not alive then return false end
        balance.Text = text(value, 60)
        return true
    end
    function api:setStatus(value)
        if not alive then return false end
        status.Text = value == nil and "" or text(value)
        return true
    end
    function api:setItems(items)
        if not alive or busy then return false end
        arrayLength(items, 100)
        local seen, clean = {}, {}
        for _, item in ipairs(items) do
            assert(type(item) == "table" and getmetatable(item) == nil and type(item.id) == "string" and #item.id > 0 and #item.id <= 100, "Each item needs an id")
            assert(not seen[item.id], "Duplicate shop item id")
            assert(item.icon == nil or (type(item.icon) == "string" and ICONS[item.icon]), "Unknown item icon")
            assert(item.badge == nil or (type(item.badge) == "string" and utf8.len(item.badge)), "Badge must be valid text")
            assert(item.description == nil or (type(item.description) == "string" and utf8.len(item.description)), "Description must be valid text")
            assert(item.owned == nil or type(item.owned) == "boolean", "owned must be explicit boolean")
            seen[item.id] = true
            table.insert(clean, { id = item.id, name = text(item.name or item.id, 80), price = text(item.price, 60),
                disabled = item.disabled == true or item.owned == true, owned = item.owned == true,
                icon = item.icon or theme.iconStyle, badge = item.badge and text(item.badge, 24) or "",
                description = item.description and text(item.description, 120) or "" })
        end
        -- Validate the entire replacement before changing the displayed list.
        if GuiService.SelectedObject and GuiService.SelectedObject:IsDescendantOf(list) then GuiService.SelectedObject = close end
        disconnect(itemConnections)
        for _, card in ipairs(cards) do card.root:Destroy() end
        table.clear(cards)
        empty.Visible = #clean == 0
        list.CanvasPosition = Vector2.new(0, 0)
        for index, item in ipairs(clean) do
            local row = make("Frame", list, {
                Name = "Item_" .. index, LayoutOrder = index, Size = UDim2.new(1, -8, 0, math.max(theme.cardHeight, 184)),
                BackgroundColor3 = theme.card, BorderSizePixel = 0,
            })
            round(row, math.min(theme.radius, 14)); outline(row)
            local isCard = theme.layout == "cards"
            glyph(row, item.icon, isCard and UDim2.new(0.5, -30, 0, 18) or UDim2.fromOffset(12, 15), UDim2.fromOffset(60, 60))
            local badge = label(row, "Badge", item.badge, 11, UDim2.fromOffset(12, 8), UDim2.new(1, -24, 0, 17))
            badge.TextXAlignment = Enum.TextXAlignment.Right; badge.Font = theme.titleFont; badge.TextColor3 = muted
            local titleY = isCard and 82 or 18
            local titleX = isCard and 12 or 84
            local itemName = label(row, "Name", item.name, 17, UDim2.fromOffset(titleX, titleY), UDim2.new(1, -titleX - 12, 0, isCard and 54 or 40))
            itemName.Font = theme.titleFont
            itemName.TextTruncate = Enum.TextTruncate.AtEnd
            if isCard then itemName.TextXAlignment = Enum.TextXAlignment.Center end
            local description = label(row, "Description", item.description, 12, UDim2.fromOffset(titleX, titleY + (isCard and 54 or 40)), UDim2.new(1, -titleX - 12, 0, 32))
            description.TextTruncate = Enum.TextTruncate.AtEnd
            description.TextColor3 = muted
            if isCard then description.TextXAlignment = Enum.TextXAlignment.Center end
            description.Visible = item.description ~= ""
            local price = label(row, "Price", item.price, 14, UDim2.new(0, 14, 1, -78), UDim2.new(1, -28, 0, 24))
            if isCard then price.TextXAlignment = Enum.TextXAlignment.Center end
            price.TextColor3 = muted
            local choose = button(row, "Choose", item.owned and "Owned" or (item.disabled and "Unavailable" or "Choose"), UDim2.new(0, 12, 1, -54), UDim2.new(1, -24, 0, 42))
            table.insert(cards, { root = row, button = choose, disabled = item.disabled })
            listen(choose.Activated, function()
                if not alive or not opened or busy or item.disabled or not options.onRequest then return end
                busy = true
                refreshButtons()
                status.Text = "Waiting for server…"
                local ok, accepted, message = pcall(options.onRequest, item.id)
                if not alive then return end
                busy = false
                refreshButtons()
                if ok and accepted == true then
                    status.Text = text(message or "Request confirmed.")
                else
                    status.Text = text(ok and message or "Request failed. Try again.")
                    if status.Text == "—" then status.Text = "Not completed. Try again." end
                end
            end, itemConnections)
        end
        refreshButtons()
        fitPanelHeight()
        status.Text = options.onRequest and "" or "Shop is not connected yet."
        return true
    end
    local function dispose()
        if not alive then return false end
        api:close()
        alive = false
        disconnect(itemConnections)
        disconnect(connections)
        table.clear(notices)
        if noticeTween then noticeTween:Cancel(); noticeTween = nil end
        if openTween then openTween:Cancel(); openTween = nil end
        return true
    end
    function api:destroy()
        if not dispose() then return false end
        gui:Destroy()
        return true
    end
    listen(gui.Destroying, dispose)
    listen(launch.Activated, function() api:open() end)
    listen(close.Activated, function() api:close() end)
    listen(backdrop.Activated, function() api:close() end)
    listen(Input.InputBegan, function(input, processed)
        if not processed and (input.KeyCode == Enum.KeyCode.Escape or input.KeyCode == Enum.KeyCode.ButtonB) then api:close() end
    end)
    api.gui = gui
    api:setItems({})
    return api
end

return AppleUI
`;
