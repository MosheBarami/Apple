--!strict
-- StudPilot Studio: connects this Studio to a StudPilot project. Press Connect on studpilot.app; the
-- project then edits this place directly. No saved session token, asset loaders or remote code execution.
local RunService = game:GetService("RunService")
local Selection = game:GetService("Selection")
local okHistory, ChangeHistoryService = pcall(function() return game:GetService("ChangeHistoryService") end)
if not okHistory then ChangeHistoryService = nil end

-- SCENE REVISION: changes made in Studio by anything but StudPilot's own ops (a person editing by hand, another
-- plugin). The worker tells the agent when it moved, so earlier reads are not trusted after a manual edit (handoff
-- 2026-10-09, case 5). Events from StudPilot's ops are deferred like any signal, so the op counter is released with
-- task.defer after the op, behind them.
local sceneRev = 0
local executingOps = 0
local function sceneChanged()
	if executingOps == 0 then sceneRev += 1 end
end
for _, name in { "Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPlayer", "StarterPack", "Lighting", "SoundService", "Teams" } do
	local ok, svc = pcall(function() return game:GetService(name) end)
	if ok and svc then
		pcall(function()
			svc.DescendantAdded:Connect(sceneChanged)
			svc.DescendantRemoving:Connect(sceneChanged)
		end)
	end
end
if ChangeHistoryService then
	pcall(function() ChangeHistoryService.OnUndo:Connect(sceneChanged) end)
	pcall(function() ChangeHistoryService.OnRedo:Connect(sceneChanged) end)
	pcall(function() (ChangeHistoryService :: any).OnRecordingFinished:Connect(sceneChanged) end)
end
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
-- Studio it models). editModeActive() is the definition the write fence below uses; the engine
-- gets that one, so a refusal names the thing that is actually shut.
local commands = Commands.new({ isEdit = editModeActive })
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
	-- Not echoed back: the plugin's own lines, and the former prefix ("Apple...", which the place names it wrote still carry).
	if string.find(textValue, "StudPilot", 1, true) == 1 or string.find(textValue, "Apple", 1, true) == 1 then return end
	local level = "output"
	local kind = tostring(messageType)
	if string.find(kind, "Warning", 1, true) then level = "warn"
	elseif string.find(kind, "Error", 1, true) then level = "error"
	elseif string.find(kind, "Info", 1, true) then level = "info" end
	bridge:pushEvent({ kind = "log", message = string.sub(textValue, 1, 600), level = level, clock = os.clock() })
end

-- THE INSTALL IDENTITY. Generated once and kept in this plugin's settings: an address (installId) and
-- the credential that goes with it (secret). It is not a session: the server hands a session token
-- back only for a binding the project owner made by pressing Connect on studpilot.app, and that token
-- lives in memory only. studioSessionId tells apart two Studio windows of the same install.
local INSTALL_SETTING = "StudPilotInstallV1"
local HttpService = game:GetService("HttpService")

local function randomHex(): string
	return string.lower((string.gsub(HttpService:GenerateGUID(false), "[^%x]", "")))
end

local function loadInstall(): any
	local okRead, saved = pcall(function() return plugin:GetSetting(INSTALL_SETTING) end)
	if okRead and type(saved) == "table" and type(saved.installId) == "string" and #saved.installId == 32
		and type(saved.secret) == "string" and #saved.secret == 64 then
		return { installId = saved.installId, secret = saved.secret }
	end
	local fresh = { installId = randomHex(), secret = randomHex() .. randomHex() }
	pcall(function() plugin:SetSetting(INSTALL_SETTING, fresh) end)
	return fresh
end

local install = loadInstall()
local studioSessionId = randomHex()

local function identity(): any
	local userId = 0
	pcall(function() userId = game:GetService("StudioService"):GetUserId() end)
	return {
		installId = install.installId,
		secret = install.secret,
		studioSessionId = studioSessionId,
		robloxUserId = if type(userId) == "number" then userId else 0,
	}
end

-- THE DOCK. Its one job is the connection, so it shows one of three states and nothing else:
-- waiting (with the one hint that gets you connected), connected to <project> (with Disconnect),
-- or a connection problem (one line and Retry). Everything else lives in the docs.
local toolbar = plugin:CreateToolbar("StudPilot")
local toggle = toolbar:CreateButton("AppleStudioOpen", "Open StudPilot", "", "StudPilot")
toggle.ClickableWhenViewportHidden = true
local widget = plugin:CreateDockWidgetPluginGuiAsync(
	"AppleStudioWorkspaceV1",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 300, 200, 240, 160)
)
widget.Title = "StudPilot"

local GREEN = Color3.fromRGB(52, 199, 89)
local AMBER = Color3.fromRGB(255, 176, 32)
local RED = Color3.fromRGB(255, 69, 58)

-- Studio's own colours, so the dock reads as part of Studio in the light and the dark theme alike.
local function themeColor(name: string, fallback: Color3): Color3
	local ok, value = pcall(function()
		return (settings() :: any).Studio.Theme:GetColor((Enum :: any).StudioStyleGuideColor[name])
	end)
	return if ok and typeof(value) == "Color3" then value else fallback
end

local root = Instance.new("Frame")
root.Name = "StudPilotDock"
root.Size = UDim2.fromScale(1, 1)
root.BorderSizePixel = 0
root.Parent = widget
local padding = Instance.new("UIPadding")
padding.PaddingLeft = UDim.new(0, 16)
padding.PaddingRight = UDim.new(0, 16)
padding.PaddingTop = UDim.new(0, 16)
padding.PaddingBottom = UDim.new(0, 12)
padding.Parent = root
local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 8)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = root

local themed: { () -> () } = {}
local order = 0

local function label(size: number, muted: boolean, bold: boolean): TextLabel
	order += 1
	local item = Instance.new("TextLabel")
	item.LayoutOrder = order
	item.Size = UDim2.new(1, 0, 0, 0)
	item.AutomaticSize = Enum.AutomaticSize.Y
	item.BackgroundTransparency = 1
	item.Font = if bold then Enum.Font.SourceSansSemibold else Enum.Font.SourceSans
	item.TextSize = size
	item.TextWrapped = true
	item.TextXAlignment = Enum.TextXAlignment.Left
	item.Text = ""
	item.Parent = root
	table.insert(themed, function()
		item.TextColor3 = if muted then themeColor("DimmedText", Color3.fromRGB(150, 150, 156)) else themeColor("MainText", Color3.fromRGB(235, 235, 238))
	end)
	return item
end

local function button(): TextButton
	order += 1
	local item = Instance.new("TextButton")
	item.LayoutOrder = order
	item.Size = UDim2.new(0, 112, 0, 28)
	item.BorderSizePixel = 0
	item.AutoButtonColor = true
	item.Font = Enum.Font.SourceSansSemibold
	item.TextSize = 14
	item.Text = ""
	item.Parent = root
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 4)
	corner.Parent = item
	local stroke = Instance.new("UIStroke")
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Parent = item
	table.insert(themed, function()
		item.BackgroundColor3 = themeColor("Button", Color3.fromRGB(60, 60, 64))
		item.TextColor3 = themeColor("ButtonText", Color3.fromRGB(235, 235, 238))
		stroke.Color = themeColor("ButtonBorder", Color3.fromRGB(80, 80, 86))
	end)
	return item
end

-- Header: a status dot and one line saying what is true now.
order += 1
local header = Instance.new("Frame")
header.LayoutOrder = order
header.Size = UDim2.new(1, 0, 0, 22)
header.BackgroundTransparency = 1
header.Parent = root
local dot = Instance.new("Frame")
dot.Size = UDim2.new(0, 10, 0, 10)
dot.Position = UDim2.new(0, 0, 0.5, -5)
dot.BorderSizePixel = 0
dot.Parent = header
local dotCorner = Instance.new("UICorner")
dotCorner.CornerRadius = UDim.new(1, 0)
dotCorner.Parent = dot
local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -18, 1, 0)
title.Position = UDim2.new(0, 18, 0, 0)
title.BackgroundTransparency = 1
title.Font = Enum.Font.SourceSansSemibold
title.TextSize = 17
title.TextXAlignment = Enum.TextXAlignment.Left
title.TextTruncate = Enum.TextTruncate.AtEnd
title.Text = ""
title.Parent = header
table.insert(themed, function()
	title.TextColor3 = themeColor("MainText", Color3.fromRGB(235, 235, 238))
	root.BackgroundColor3 = themeColor("MainBackground", Color3.fromRGB(46, 46, 46))
end)

local detail = label(14, true, false)
local action = button()

-- A build that needs another creator's free asset asks here, and only while one is waiting.
local sourcesHeading = label(14, false, true)
sourcesHeading.Text = "May StudPilot add free Roblox assets to this game?"
local sourcesSave = button()
sourcesSave.Size = UDim2.new(0, 180, 0, 28)
sourcesSave.Text = "Allow assets and continue"
local sourcesNote = label(13, true, false)
local function showSources(owed: boolean, message: string?)
	sourcesHeading.Visible = owed
	sourcesSave.Visible = owed
	sourcesNote.Text = message or ""
	sourcesNote.Visible = message ~= nil
	if owed then widget.Enabled = true end
end
showSources(false, nil)

-- Footer: the version, and the credit the Resurface License §1 requires (THIRD_PARTY_NOTICES.md).
local footer = label(11, true, false)
footer.LayoutOrder = 100
footer.Text = "StudPilot Studio · 2.0.0 · Classic studs by Resurface (cxmeel)"

local function paint()
	for _, apply in themed do pcall(apply) end
end
paint()
pcall(function()
	table.insert(connections, (settings() :: any).Studio.ThemeChanged:Connect(paint))
end)

local view = "waiting"
local problem: string? = nil
local retryNow = false
-- 2.0: the first request of this load is answered at once (Bridge:connect), so one still out after 8 s is
-- waiting on Studio's HTTP permission prompt for studpilot.app. Said in one line, while it lasts.
local firstAnswered = false
local promptHint = false
local PROMPT_HINT = "Allow StudPilot to reach studpilot.app in the prompt Studio is showing"

local function render()
	if disposed then return end
	local projectName = if bridge ~= nil then bridge:projectName() else nil
	if projectName ~= nil then
		view = "connected"
		dot.BackgroundColor3 = GREEN
		title.Text = "Connected to " .. projectName
		detail.Text = game.Name
		action.Text = "Disconnect"
		action.Visible = true
	elseif problem ~= nil then
		view = "problem"
		dot.BackgroundColor3 = RED
		title.Text = "Can’t reach StudPilot"
		detail.Text = problem
		action.Text = "Retry"
		action.Visible = true
	else
		view = "waiting"
		dot.BackgroundColor3 = AMBER
		title.Text = "Waiting for StudPilot"
		detail.Text = if promptHint and not firstAnswered then PROMPT_HINT else "Open your project on studpilot.app and press Connect."
		action.Visible = false
	end
	if projectName == nil then showSources(false, nil) end
end

-- The connection fence every op is executed against: this exact connection is still live.
local function connectionCurrent(sessionCurrent: (() -> boolean)?): boolean
	if disposed or bridge == nil or not bridge:isConnected() then return false end
	if sessionCurrent == nil then return true end
	local ok, current = pcall(sessionCurrent)
	return ok and current == true
end

bridge = Bridge.new({
	plugin = plugin,
	capabilities = function() return Commands.capabilities(commands) end,
	-- Connecting IS the permission: once the project owner pressed Connect for this Studio, StudPilot
	-- edits without a second step. Writes still need a live connection and Studio edit mode (the
	-- engine refuses outside it), and an undo recording, exactly as before.
	execute = function(id: string, op: any, sessionCurrent: (() -> boolean)?)
		local function liveConnection(): boolean
			return connectionCurrent(sessionCurrent)
		end
		local function writeFence(): boolean
			return liveConnection() and editModeActive()
		end
		local isRunMode = type(op) == "table" and op.op == "run_mode"
		-- Run-mode stop/pause/resume happen while Studio is intentionally outside edit mode, so they
		-- are fenced by the connection alone; every other write also needs edit mode.
		local authorized = if isRunMode then liveConnection() else writeFence()
		-- A viewport snapshot reads pixels only; StudioCapture fences edit mode itself.
		local readFence = if type(op) == "table" and op.op == "capture_studio_viewport" then liveConnection else writeFence
		executingOps += 1
		local results = table.pack(pcall(function() return commands:execute(id, op, authorized, readFence) end))
		if task and type(task.defer) == "function" then task.defer(function() executingOps -= 1 end) else executingOps -= 1 end
		if not results[1] then error(results[2], 0) end
		return table.unpack(results, 2, results.n)
	end,
	state = function()
		return {
			kind = "state", placeName = game.Name, placeId = game.PlaceId,
			gameId = game.GameId, isRunMode = RunService:IsRunMode(),
			selectionCount = #Selection:Get(), pluginVersion = "2.0.0", sceneRev = sceneRev,
		}
	end,
	onStatus = function(_message: string)
		if disposed then return end
		render()
	end,
	onActivity = function(_message: string) end,
	onAssetSources = function(value: any)
		if disposed or type(value) ~= "table" then return end
		showSources(value.owed == true, if type(value.message) == "string" then value.message else nil)
	end,
})

table.insert(connections, sourcesSave.Activated:Connect(function()
	if disposed then return end
	local sent = bridge:answerAssetSources({ "creator_store" })
	sourcesNote.Text = if sent then "Saving…" else "Connect StudPilot first."
	sourcesNote.Visible = true
end))

table.insert(connections, action.Activated:Connect(function()
	if disposed then return end
	if view == "connected" then
		task.spawn(function() bridge:release(identity()) end)
		render()
	elseif view == "problem" then
		problem = nil
		retryNow = true
		render()
	end
end))

-- THE CONNECTION LOOP. While not connected, announce (the server holds each announce ~20 s and answers
-- with a token once Connect is pressed for this Studio, or at once when this place was bound before).
-- While connected, a heartbeat every 20 s keeps this Studio visible to Connect and follows it if the
-- owner moves it to another project. A lost session (Disconnect on the web, an expired token) simply
-- drops back to announcing.
local function pause(seconds: number, wasConnected: boolean?)
	local waited = 0
	while waited < seconds and not disposed and not retryNow and (wasConnected ~= true or bridge:isConnected()) do
		task.wait(0.5)
		waited += 0.5
	end
	retryNow = false
end

task.spawn(function()
	local started = os.clock()
	while not disposed and not firstAnswered and os.clock() - started < 8 do task.wait(0.5) end
	if disposed or firstAnswered then return end
	promptHint = true
	render()
end)

task.spawn(function()
	local failures = 0
	while not disposed do
		if bridge:isConnected() then
			failures = 0
			pause(20, true)
			if not disposed and bridge:isConnected() then pcall(function() bridge:heartbeat(identity()) end) end
		else
			local called, connected, message, state = pcall(function() return bridge:connect(identity()) end)
			if disposed then break end
			firstAnswered = true
			if called and connected then
				failures = 0
				problem = nil
				captureSelection()
				render()
			elseif called and state == "waiting" then
				failures = 0
				problem = nil
				render()
				pause(2)
			else
				failures += 1
				problem = if called and type(message) == "string" then message else "Check Studio’s network permission for studpilot.app."
				render()
				pause(math.min(60, 5 * failures))
			end
		end
	end
end)

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

table.insert(connections, toggle.Click:Connect(function()
	widget.Enabled = not widget.Enabled
	toggle:SetActive(widget.Enabled)
end))
table.insert(connections, widget:GetPropertyChangedSignal("Enabled"):Connect(function()
	toggle:SetActive(widget.Enabled)
end))

plugin.Unloading:Connect(function()
	disposed = true
	bridge:destroy()
	commands:destroy()
	for _, connection in connections do connection:Disconnect() end
end)
render()
