--!strict
-- StudPilot Studio: an explicit, inspect-first connection to the StudPilot workspace.
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
	-- A simulation started with RunService:Run() leaves IsEdit() AND StudioTestService.EditModeActive
	-- true. Measured 2026-09-22 (run 604bfd32): StudPilot's own playtest was still running and two
	-- edit_script writes were admitted as "edit mode". A running simulation is not edit mode.
	local runningOk, running = pcall(function() return RunService:IsRunning() end)
	if runningOk and running == true then return false end
	if StudioTestService == nil then
		-- Explicit compatibility fallback for environments where the Studio-only service is absent.
		-- This preserves the RunService gate but cannot prove a Studio test transition by itself.
		return true
	end
	local testOk, testEditModeActive = pcall(function() return StudioTestService.EditModeActive end)
	return testOk and testEditModeActive == true
end

if not editModeActive() then
	-- In a Test session's server, end a StudPilot play check the place stopped (PlayCheck.watchdog).
	local okServer, isServer = pcall(function() return RunService:IsServer() and not RunService:IsEdit() end)
	if okServer and isServer then
		pcall(function() require(script.PlayCheck).watchdog(game) end)
	end
	return
end

local Bridge = require(script.Bridge)
local Commands = require(script.Commands)
-- ONE DEFINITION OF EDIT MODE, HANDED DOWN — not two kept in step by care. Commands.luau falls
-- back to RunService:IsEdit() alone when it is given nothing, and IsEdit() stays true in this
-- DataModel while Studio runs a test (tests/entry-runtime.test.mjs asserts exactly that about the
-- Studio it models). So the engine's gate would have read "we are in edit mode" at the same moment
-- this file was force-clearing consent because we are not, and the user would be told to press a
-- button that refuses. editModeActive() is the definition the consent fence already uses; the
-- engine gets that one, so a refusal names the thing that is actually shut.
local ownerGatewayConfig: any = nil
local commands = Commands.new({ isEdit = editModeActive, ownerGateway = function() return ownerGatewayConfig end })
local allowEdits = false
local confirmingEdits = false
local connecting = false
local disposed = false
local studpilotRunActive = false
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
	-- Not echoed back: the plugin's own lines, and the former prefix ("Apple...", which the place names it wrote still carry).
	if string.find(textValue, "StudPilot", 1, true) == 1 or string.find(textValue, "Apple", 1, true) == 1 then return end
	local level = "output"
	local kind = tostring(messageType)
	if string.find(kind, "Warning", 1, true) then level = "warn"
	elseif string.find(kind, "Error", 1, true) then level = "error"
	elseif string.find(kind, "Info", 1, true) then level = "info" end
	bridge:pushEvent({ kind = "log", message = string.sub(textValue, 1, 600), level = level, clock = os.clock() })
end

local toolbar = plugin:CreateToolbar("StudPilot Studio")
local toggle = toolbar:CreateButton("AppleStudioOpen", "Open StudPilot Studio", "", "StudPilot")
toggle.ClickableWhenViewportHidden = true
local widget = plugin:CreateDockWidgetPluginGuiAsync(
	"AppleStudioWorkspaceV1",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 360, 560, 280, 340)
)
widget.Title = "StudPilot Studio"

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

local heading = text("StudPilot", 30, false)
heading.Font = Enum.Font.SourceSansSemibold
text("Your place. Your control.", 15, true)
-- F-026: the token is deliberately never saved (surface.test.mjs forbids GetSetting), so closing
-- Studio ends the pairing; say so before the customer finds out from a code that no longer works.
local status = text("Not connected. A pairing lasts until Studio closes; after a restart, enter a new code from your StudPilot project.", 17, false)
local place = text(game.Name, 13, true)

-- A build that needs another creator's free asset asks for consent here. The owner removed the
-- source selector from the customer experience: detailed props come from vetted Roblox assets,
-- and only simple structure may be made from parts. The wire answer remains an explicit,
-- authenticated creator_store policy; an unanswered question still permits no asset insertion.
local sourcesHeading = text("May StudPilot add free Roblox assets to this game?", 20, false)
sourcesHeading.Font = Enum.Font.SourceSansSemibold
local sourceItems: { any } = { sourcesHeading, text("A build is waiting. Some free assets are made by other Roblox creators. No purchase or asset upload is needed; building still uses Credits. Roblox may block individual assets. Your answer is remembered for this project.", 14, true) }
local sourcesSave = control("Allow assets and continue")
table.insert(sourceItems, sourcesSave)
local sourcesNote = text("", 13, false)
sourcesNote.Visible = false
local function showSources(owed: boolean, message: string?)
	for _, item in sourceItems do item.Visible = owed end
	sourcesNote.Text = message or ""
	sourcesNote.Visible = message ~= nil
	if owed then widget.Enabled = true end
end
showSources(false, nil)
		text("Pair with a project at studpilot.app. While connected, StudPilot may read this place’s objects and scripts, the current selection, Studio Output messages, and snapshots of the active 3D viewport over HTTPS.", 14, true)

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
local connect = control("Connect to StudPilot")

text("Your owner library connects by itself while StudPilot is paired (the library server on this Mac, port 63747). Selected descriptions/source pages may be sent to the agent over HTTPS; native asset bytes stay in Studio. Downloaded source is never executed.", 13, true)
local function gatewayField(name: string, placeholder: string): TextBox
    order += 1
    local field = Instance.new("TextBox")
    field.Name = name; field.LayoutOrder = order; field.Size = UDim2.new(1,0,0,40)
    field.BackgroundColor3 = colors.panel; field.TextColor3 = colors.text; field.PlaceholderColor3 = colors.muted
    field.Font = Enum.Font.SourceSans; field.TextSize = 14; field.Text = ""; field.PlaceholderText = placeholder
    field.ClearTextOnFocus = false; field.Parent = scroll
    return field
end
local gatewayPort = gatewayField("OwnerGatewayPort","Local gateway port")
local gatewayKey = gatewayField("OwnerGatewayKey","Ephemeral gateway key (cleared on connect)")
local gatewayConnect = control("Connect private owner library")
local gatewayNote = text("Owner library: checking…",13,true)
-- OWNER, 2026-10-01 ("manually entering it every time in the plugin is trash"): the library connects by itself, so
-- the port/key fields are an override nobody needs day to day. They stay in the tree (hidden) for --require-key.
gatewayPort.Visible = false
gatewayKey.Visible = false
gatewayConnect.Visible = false
local permission = text("Access: inspect only", 15, false)
local edits = control("Enable edits…")
local disclosure = text("Edits stay off until you allow them. This build supports bounded place operations, Run-mode playtests and short player Test sessions. It cannot publish, upload assets or execute arbitrary received Luau inside the plugin.", 13, true)
local activity = text("No actions yet", 13, true)
local version = text("StudPilot Studio · 1.5.0 · independent preview", 12, true)
-- Resurface License §1: prominent credit and a link (THIRD_PARTY_NOTICES.md).
text("Classic studs by Resurface (cxmeel) · github.com/cxmeel/resurface-plugin", 12, true)
version.LayoutOrder = 100

local probeLibrary
-- What the owner library holds, read from the local library server (loopback, no key); at most every 30 seconds.
local lastLibraryProbe = 0
probeLibrary = function()
	if os.clock() - lastLibraryProbe < 30 then return end
	lastLibraryProbe = os.clock()
	task.spawn(function()
		local ok, report = pcall(function()
			local http = game:GetService("HttpService")
			local res = http:RequestAsync({ Url = "http://127.0.0.1:63747/v1/library/report", Method = "GET" })
			if not res.Success then return nil end
			return http:JSONDecode(res.Body)
		end)
		if disposed then return end
		if ok and type(report) == "table" and type(report.games) == "number" then
			gatewayNote.Text = string.format("Owner library: connected · %d games · %d assets", report.games, tonumber(report.assets) or 0)
		else
			gatewayNote.Text = "Owner library: not running on this Mac (it starts at login; or run packages/owner-corpus/start-gateway.sh)"
			lastLibraryProbe = 0
		end
	end)
end

local function refreshAccess()
	local connected = bridge ~= nil and bridge:isConnected()
	if not connected then
		allowEdits = false
		confirmingEdits = false
		studpilotRunActive = false
		showSources(false, nil)
		ownerGatewayConfig = nil
		gatewayKey.Text = ""
		gatewayNote.Text = "Owner library: connects when StudPilot is paired"
	else
		probeLibrary()
	end
	permission.Text = if allowEdits and not editModeActive() then "Access: edits paused while Studio is testing"
		elseif allowEdits then "Access: edits allowed for this connection" else "Access: inspect only"
	edits.Text = if allowEdits then "Turn edits off" elseif confirmingEdits then "Allow edits for this connection" else "Enable edits…"
	edits.Active = connected and not connecting
	edits.AutoButtonColor = edits.Active
	edits.TextColor3 = if edits.Active then colors.text else colors.muted
	disclosure.Text = if confirmingEdits
			then "StudPilot may create or change supported objects and scripts in this place, control a Run-mode playtest, and start a short Test session with a player (its temporary check scripts are removed afterwards). Writes require edit mode and an undo recording. Disconnecting turns this permission off."
			else "Edits stay off until you allow them. This build supports bounded place operations, Run-mode playtests and short player Test sessions. It cannot publish, upload assets or execute arbitrary received Luau inside the plugin."
	connect.Text = if connecting then "Connecting…" elseif connected then "Disconnect" else "Connect to StudPilot"
	code.Visible = not connected
end

local function keepEditConsentOnlyInEditMode(): boolean
	if editModeActive() then
		studpilotRunActive = false
		refreshAccess()
		return true
	end
	-- Outside edit mode every write is refused (the gate above), so leaving it PAUSES StudPilot's edits rather
	-- than revoking the person's consent. Decision D-PLUGIN-2 (2026-09-23): a kid presses Play to try the
	-- game all the time, and revoking on every test made each next request fail until "Enable edits…" was
	-- clicked twice again; after StudPilot's own playtest a test-state flicker did the same (F-044). The consent
	-- was given for this connection, and it ends only when the connection does or the person turns it off.
	-- A half-finished confirmation is still retired, so a stale first click cannot grant.
	confirmingEdits = false
	refreshAccess()
	return false
end

bridge = Bridge.new({
	plugin = plugin,
	capabilities = function() return Commands.capabilities(commands) end,
	execute = function(id: string, op: any, sessionCurrent: (() -> boolean)?)
			local function pairingStillCurrent(): boolean
				if disposed or not bridge:isConnected() then return false end
				if sessionCurrent == nil then return true end
				local ok, current = pcall(sessionCurrent)
				return ok and current == true
			end
			local function consentStillCurrent(): boolean
				if not pairingStillCurrent() then return false end
				if not keepEditConsentOnlyInEditMode() then return false end
				return allowEdits
			end
			local runAction = if type(op) == "table" and op.op == "run_mode" then op.action else nil
			local startsAppleRun = runAction == "start" or runAction == "run" or runAction == "restart"
			local ownedBefore = studpilotRunActive
			if startsAppleRun and allowEdits and editModeActive() then studpilotRunActive = true end
			-- Run-mode stop/pause/resume happen while Studio is intentionally outside edit mode. The
			-- retained per-connection consent authorizes those controls; ordinary writes still receive
			-- consentStillCurrent() and remain blocked until Studio returns to edit mode.
			local authorized = if runAction ~= nil then pairingStillCurrent() and allowEdits else consentStillCurrent()
			-- Pairing already consents to active viewport snapshots. This operation reads
			-- native pixels without camera/place writes; StudioCapture also fences edit mode.
			local readFence = if type(op) == "table" and (op.op == "query_owner_local" or op.op == "query_owner_exact" or op.op == "query_owner_assembly" or op.op == "query_owner_media" or op.op == "query_owner_library" or op.op == "capture_studio_viewport") then pairingStillCurrent else consentStillCurrent
			local result = commands:execute(id, op, authorized, readFence)
			if runAction ~= nil then
				if result.ok ~= true then
					studpilotRunActive = ownedBefore
				elseif runAction == "stop" then
					studpilotRunActive = false
				elseif result.data and result.data.runMode == true then
					studpilotRunActive = true
				end
			end
			return result
		end,
	state = function()
		return {
			kind = "state", placeName = game.Name, placeId = game.PlaceId,
			gameId = game.GameId, isRunMode = RunService:IsRunMode(),
			selectionCount = #Selection:Get(), pluginVersion = "1.5.0",
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
	onAssetSources = function(value: any)
		if disposed or type(value) ~= "table" then return end
		showSources(value.owed == true, if type(value.message) == "string" then value.message else nil)
	end,
})

table.insert(connections, gatewayConnect.Activated:Connect(function()
    local key = gatewayKey.Text
    gatewayKey.Text = ""
    if disposed or not bridge:isConnected() then gatewayNote.Text = "Pair with StudPilot first."; return end
    if ownerGatewayConfig then ownerGatewayConfig = nil; gatewayNote.Text = "Private library disconnected"; return end
    local port = tonumber(gatewayPort.Text)
    if port == nil or port ~= math.floor(port) or port < 1 or port > 65535 or #key < 32 or #key > 128 or string.match(key,"^[%w_-]+$") == nil then
        gatewayNote.Text = "Enter the current local port and ephemeral key."; return
    end
    ownerGatewayConfig = {port=port,key=key}
    gatewayNote.Text = "Private library configured for this session; requests verify gateway access. Click again to disconnect."
end))

table.insert(connections, sourcesSave.Activated:Connect(function()
	if disposed then return end
	local sent = bridge:answerAssetSources({ "creator_store" })
	sourcesNote.Text = if sent then "Saving…" else "Connect to StudPilot first."
	sourcesNote.Visible = true
end))

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
		status.Text = "Enter the six-character code from your StudPilot project."
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
	ownerGatewayConfig = nil
	gatewayKey.Text = ""
	allowEdits = false
	confirmingEdits = false
	bridge:destroy()
	commands:destroy()
	for _, connection in connections do connection:Disconnect() end
end)
refreshAccess()
