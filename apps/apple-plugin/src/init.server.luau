--!strict
-- Apple Studio: an explicit, inspect-first connection to the Apple workspace.
-- No saved credentials, automatic pairing, asset loaders or remote code execution.
local RunService = game:GetService("RunService")
local Selection = game:GetService("Selection")
local StudioTestService: any = nil
local studioTestServiceOk, studioTestService = pcall(function() return game:GetService("StudioTestService") end)
if studioTestServiceOk then StudioTestService = studioTestService end
local LogService: any = nil
pcall(function() LogService = game:GetService("LogService") end)

local function editModeActive(): boolean
	local runOk, runIsEdit = pcall(function() return RunService:IsEdit() end)
	if not runOk or runIsEdit ~= true then return false end
	if StudioTestService == nil then
		-- Explicit compatibility fallback for environments where the Studio-only service is absent.
		-- This preserves the RunService gate but cannot prove a Studio test transition by itself.
		return true
	end
	local testOk, testEditModeActive = pcall(function() return StudioTestService.EditModeActive end)
	return testOk and testEditModeActive == true
end

if not editModeActive() then return end

local Bridge = require(script.Bridge)
local Commands = require(script.Commands)
-- ONE DEFINITION OF EDIT MODE, HANDED DOWN — not two kept in step by care. Commands.luau falls
-- back to RunService:IsEdit() alone when it is given nothing, and IsEdit() stays true in this
-- DataModel while Studio runs a test (tests/entry-runtime.test.mjs asserts exactly that about the
-- Studio it models). So the engine's gate would have read "we are in edit mode" at the same moment
-- this file was force-clearing consent because we are not, and the user would be told to press a
-- button that refuses. editModeActive() is the definition the consent fence already uses; the
-- engine gets that one, so a refusal names the thing that is actually shut.
local commands = Commands.new({ isEdit = editModeActive })
local allowEdits = false
local confirmingEdits = false
local connecting = false
local disposed = false
local connections: { RBXScriptConnection } = {}
local bridge: any = nil

local function pathIdentifier(value: string): boolean
	return string.match(value, "^[A-Za-z_][A-Za-z0-9_]*$") ~= nil
end

local function pathEscape(value: string): string
	local escaped = string.gsub(value, "\\", "\\\\")
	escaped = string.gsub(escaped, '"', '\\"')
	escaped = string.gsub(escaped, "\r", "\\r")
	escaped = string.gsub(escaped, "\n", "\\n")
	escaped = string.gsub(escaped, "\t", "\\t")
	return escaped
end

local function instancePath(inst: any): string?
	if inst == game then return "game" end
	local segments = {}
	local current = inst
	local depth = 0
	while current and current ~= game do
		depth += 1
		if depth > 64 then return nil end
		local okName, name = pcall(function() return current.Name end)
		if not okName or type(name) ~= "string" or #name == 0 or #name > 96 then return nil end
		table.insert(segments, 1, name)
		local okParent, parent = pcall(function() return current.Parent end)
		if not okParent then return nil end
		current = parent
	end
	if current ~= game then return nil end
	local path = "game"
	for _, segment in segments do
		if pathIdentifier(segment) then path ..= "." .. segment else path ..= '["' .. pathEscape(segment) .. '"]' end
	end
	return path
end

local function captureSelection()
	if not bridge or type(bridge.pushEvent) ~= "function" or not bridge:isConnected() then return end
	local ok, selected = pcall(function() return Selection:Get() end)
	if not ok or type(selected) ~= "table" then return end
	local items = {}
	local count = #selected
	for _, inst in selected do
		if #items >= 100 then break end
		local path = instancePath(inst)
		if path then
			local okClass, className = pcall(function() return inst.ClassName end)
			table.insert(items, { path = path, class = if okClass and type(className) == "string" then className else "Instance" })
		end
	end
	bridge:pushEvent({ kind = "selection", items = items, count = count, clock = os.clock() })
end

local function captureLog(message: any, messageType: any)
	if not bridge or type(bridge.pushEvent) ~= "function" or not bridge:isConnected() then return end
	local textValue = tostring(message)
	if string.find(textValue, "Apple", 1, true) == 1 then return end
	local level = "output"
	local kind = tostring(messageType)
	if string.find(kind, "Warning", 1, true) then level = "warn"
	elseif string.find(kind, "Error", 1, true) then level = "error"
	elseif string.find(kind, "Info", 1, true) then level = "info" end
	bridge:pushEvent({ kind = "log", message = string.sub(textValue, 1, 600), level = level, clock = os.clock() })
end

local toolbar = plugin:CreateToolbar("Apple Studio")
local toggle = toolbar:CreateButton("AppleStudioOpen", "Open Apple Studio", "", "Apple")
toggle.ClickableWhenViewportHidden = true
local widget = plugin:CreateDockWidgetPluginGuiAsync(
	"AppleStudioWorkspaceV1",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 360, 560, 280, 340)
)
widget.Title = "Apple Studio"

local colors = {
	background = Color3.fromRGB(11, 11, 12),
	panel = Color3.fromRGB(26, 26, 28),
	line = Color3.fromRGB(54, 54, 58),
	text = Color3.fromRGB(242, 242, 244),
	muted = Color3.fromRGB(168, 168, 177),
}
local scroll = Instance.new("ScrollingFrame")
scroll.Name = "ApplePanel"
scroll.Size = UDim2.fromScale(1, 1)
scroll.BackgroundColor3 = colors.background
scroll.BorderSizePixel = 0
scroll.ScrollBarThickness = 4
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.CanvasSize = UDim2.new()
scroll.Parent = widget
local padding = Instance.new("UIPadding")
padding.PaddingLeft = UDim.new(0, 20)
padding.PaddingRight = UDim.new(0, 20)
padding.PaddingTop = UDim.new(0, 24)
padding.PaddingBottom = UDim.new(0, 24)
padding.Parent = scroll
local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 14)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = scroll
local order = 0

local function text(value: string, size: number, muted: boolean): TextLabel
	order += 1
	local label = Instance.new("TextLabel")
	label.LayoutOrder = order
	label.Size = UDim2.new(1, 0, 0, 0)
	label.AutomaticSize = Enum.AutomaticSize.Y
	label.BackgroundTransparency = 1
	label.TextColor3 = if muted then colors.muted else colors.text
	label.Font = Enum.Font.SourceSans
	label.TextSize = size
	label.TextWrapped = true
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextYAlignment = Enum.TextYAlignment.Top
	label.Text = value
	label.Parent = scroll
	return label
end

local function control(value: string): TextButton
	order += 1
	local button = Instance.new("TextButton")
	button.LayoutOrder = order
	button.Size = UDim2.new(1, 0, 0, 42)
	button.BackgroundColor3 = colors.panel
	button.BorderSizePixel = 0
	button.TextColor3 = colors.text
	button.Font = Enum.Font.SourceSansSemibold
	button.TextSize = 15
	button.Text = value
	button.Parent = scroll
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 10)
	corner.Parent = button
	local stroke = Instance.new("UIStroke")
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Color = colors.line
	stroke.Parent = button
	return button
end

local heading = text("Apple", 30, false)
heading.Font = Enum.Font.SourceSansSemibold
text("Your place. Your control.", 15, true)
local status = text("Not connected", 17, false)
local place = text(game.Name, 13, true)
	text("Pair with a project at apple.moshe-barami111.workers.dev. While connected, Apple may read this place’s objects and scripts, the current selection, and Studio Output messages over HTTPS.", 14, true)

order += 1
local code = Instance.new("TextBox")
code.Name = "PairingCode"
code.LayoutOrder = order
code.Size = UDim2.new(1, 0, 0, 44)
code.BackgroundColor3 = colors.panel
code.BorderSizePixel = 0
code.TextColor3 = colors.text
code.PlaceholderColor3 = colors.muted
code.Font = Enum.Font.SourceSans
code.TextSize = 18
code.Text = ""
code.PlaceholderText = "Six-character pairing code"
code.ClearTextOnFocus = false
code.Parent = scroll
local codeCorner = Instance.new("UICorner")
codeCorner.CornerRadius = UDim.new(0, 10)
codeCorner.Parent = code
local connect = control("Connect to Apple")
local permission = text("Access: inspect only", 15, false)
local edits = control("Enable edits…")
local disclosure = text("Edits stay off until you allow them. This build supports a limited set of place operations. It cannot publish, upload assets or run code inside the plugin.", 13, true)
local activity = text("No actions yet", 13, true)
local version = text("Apple Studio · 1.0.0 · independent preview", 12, true)
version.LayoutOrder = 100

local function refreshAccess()
	local connected = bridge ~= nil and bridge:isConnected()
	if not connected then
		allowEdits = false
		confirmingEdits = false
	end
	permission.Text = if allowEdits then "Access: edits allowed for this connection" else "Access: inspect only"
	edits.Text = if allowEdits then "Turn edits off" elseif confirmingEdits then "Allow edits for this connection" else "Enable edits…"
	edits.Active = connected and not connecting
	edits.AutoButtonColor = edits.Active
	edits.TextColor3 = if edits.Active then colors.text else colors.muted
	disclosure.Text = if confirmingEdits
		then "Apple may create or change supported objects and scripts in this place. Writes require edit mode and an undo recording. Disconnecting turns this permission off."
		else "Edits stay off until you allow them. This build supports a limited set of place operations. It cannot publish, upload assets or run code inside the plugin."
	connect.Text = if connecting then "Connecting…" elseif connected then "Disconnect" else "Connect to Apple"
	code.Visible = not connected
end

local function keepEditConsentOnlyInEditMode(): boolean
	if editModeActive() then return true end
	allowEdits = false
	confirmingEdits = false
	refreshAccess()
	return false
end

bridge = Bridge.new({
	plugin = plugin,
	capabilities = function() return Commands.capabilities(commands) end,
	execute = function(id: string, op: any, sessionCurrent: (() -> boolean)?)
		local function consentStillCurrent(): boolean
			if disposed or not bridge:isConnected() then return false end
			if not keepEditConsentOnlyInEditMode() then return false end
			if not allowEdits then return false end
			if sessionCurrent == nil then return true end
			local ok, current = pcall(sessionCurrent)
			return ok and current == true
		end
		return commands:execute(id, op, consentStillCurrent(), consentStillCurrent)
	end,
	state = function()
		return {
			kind = "state", placeName = game.Name, placeId = game.PlaceId,
			gameId = game.GameId, isRunMode = RunService:IsRunMode(),
			selectionCount = #Selection:Get(), pluginVersion = "1.0.0",
		}
	end,
	onStatus = function(message: string)
		if disposed then return end
		status.Text = message
		place.Text = game.Name
		refreshAccess()
	end,
	onActivity = function(message: string)
		if not disposed then activity.Text = string.sub(message, 1, 240) end
	end,
})

table.insert(connections, connect.Activated:Connect(function()
	if disposed or connecting then return end
	allowEdits = false
	confirmingEdits = false
	if bridge:isConnected() then
		bridge:disconnect()
		refreshAccess()
		return
	end
	if not editModeActive() then
		status.Text = "Stop the Studio test before connecting."
		return
	end
	local pairingCode = string.upper(string.gsub(code.Text, "%s", ""))
	if not string.match(pairingCode, "^%w%w%w%w%w%w$") then
		status.Text = "Enter the six-character code from your Apple project."
		return
	end
	connecting = true
	refreshAccess()
	task.spawn(function()
		local called, ok, message = pcall(function() return bridge:connect(pairingCode) end)
		connecting = false
		if disposed then return end
			if called and ok then
				code.Text = ""
				captureSelection()
		elseif not called then
			status.Text = "Connection failed. Check Studio’s network permission and try again."
		elseif type(message) == "string" then
			status.Text = message
		end
		refreshAccess()
	end)
end))

local selectionSignalOk, selectionSignal = pcall(function() return Selection.SelectionChanged end)
if selectionSignalOk and selectionSignal and type(selectionSignal.Connect) == "function" then
	table.insert(connections, selectionSignal:Connect(captureSelection))
end
if LogService then
	local logSignalOk, logSignal = pcall(function() return LogService.MessageOut end)
	if logSignalOk and logSignal and type(logSignal.Connect) == "function" then
		table.insert(connections, logSignal:Connect(captureLog))
	end
end

	table.insert(connections, edits.Activated:Connect(function()
		if disposed or connecting or not bridge:isConnected() then return end
		if not keepEditConsentOnlyInEditMode() then
			status.Text = "Stop the Studio test before allowing edits."
			return
		end
	if allowEdits then
		allowEdits = false
	elseif confirmingEdits then
		allowEdits = true
		confirmingEdits = false
	else
		confirmingEdits = true
	end
	refreshAccess()
end))

table.insert(connections, toggle.Click:Connect(function()
	widget.Enabled = not widget.Enabled
	toggle:SetActive(widget.Enabled)
end))
table.insert(connections, widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	toggle:SetActive(widget.Enabled)
end))
table.insert(connections, RunService:GetPropertyChangedSignal("RunState"):Connect(function()
	keepEditConsentOnlyInEditMode()
end))
if StudioTestService ~= nil then
	local editModeSignalOk, editModeSignal = pcall(function()
		return StudioTestService:GetPropertyChangedSignal("EditModeActive")
	end)
	if editModeSignalOk and editModeSignal and type(editModeSignal.Connect) == "function" then
		table.insert(connections, editModeSignal:Connect(function()
			keepEditConsentOnlyInEditMode()
		end))
	end
end

plugin.Unloading:Connect(function()
	disposed = true
	allowEdits = false
	confirmingEdits = false
	bridge:destroy()
	commands:destroy()
	for _, connection in connections do connection:Disconnect() end
end)
refreshAccess()
