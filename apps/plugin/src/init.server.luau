--!strict
-- Golem for Studio — connects this place to a Golem project session.
-- Local-plugin install: no permission prompts; HTTP + script edits work out of the box.
local HttpService = game:GetService("HttpService")
local LogService = game:GetService("LogService")
local RunService = game:GetService("RunService")
local Selection = game:GetService("Selection")

local Ops = require(script.Ops)
local Version = require(script.Version)

local VERSION = Version.VERSION
local PROTOCOL = Version.PROTOCOL
local DEFAULT_API = "https://golem.moshe-barami111.workers.dev"

-- Only drive the session from the edit DataModel (Play Solo spawns a second copy).
if not RunService:IsEdit() and not RunService:IsRunMode() then
	return
end

-- ---------------------------------------------------------------- state
type Session = { token: string, projectId: string, projectName: string, apiBase: string }
local session: Session? = nil
local connected = false
--[[ Which poll loop is the current one.

	 Every loop captures the generation it was started with and exits as soon as it sees a
	 newer one. That is how a reconnect retires the previous loop WITHOUT killing its thread —
	 see stopPolling for why killing it is not an option. ]]
local pollGeneration = 0
local logBuffer: { any } = {}
local recentOps: { string } = {}

local savedRaw = plugin:GetSetting("golem_session")
if type(savedRaw) == "string" then
	local ok, saved = pcall(HttpService.JSONDecode, HttpService, savedRaw)
	if ok and type(saved) == "table" and saved.token then
		session = saved :: Session
	end
end

LogService.MessageOut:Connect(function(message: string, messageType: Enum.MessageType)
	if #logBuffer > 200 then table.remove(logBuffer, 1) end
	local level = "output"
	if messageType == Enum.MessageType.MessageWarning then level = "warn"
	elseif messageType == Enum.MessageType.MessageError then level = "error"
	elseif messageType == Enum.MessageType.MessageInfo then level = "info" end
	if string.find(message, "Golem", 1, true) == 1 then return end
	table.insert(logBuffer, { kind = "log", message = string.sub(message, 1, 300), level = level, clock = os.clock() })
end)

local function stateEvent(): any
	return {
		kind = "state",
		placeName = game.Name,
		placeId = game.PlaceId,
		gameId = game.GameId,
		isRunMode = RunService:IsRunMode(),
		selectionCount = #Selection:Get(),
		pluginVersion = VERSION,
	}
end

-- Identity travels on the headers of EVERY request, pairing included, rather than
-- inside the JSON body. Two reasons. The server needs to know what it is talking to
-- before it parses a body — and at /api/studio/claim there is no body field to put it
-- in. And an older plugin that never sends these simply omits two headers, which is
-- indistinguishable at the HTTP layer from any other client; nothing on either side
-- has to special-case it.
local function post(url: string, body: any, token: string?): (boolean, any, number)
	local ok, res = pcall(function()
		return HttpService:RequestAsync({
			Url = url,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["X-Golem-Token"] = token or "",
				["X-Golem-Plugin-Version"] = VERSION,
				["X-Golem-Plugin-Protocol"] = tostring(PROTOCOL),
			} :: { [string]: string },
			Body = HttpService:JSONEncode(body),
		})
	end)
	if not ok then
		return false, { error = tostring(res) }, 0
	end
	local r = res :: any
	local parsed = nil
	pcall(function() parsed = HttpService:JSONDecode(r.Body) end)
	return r.Success, parsed or { error = r.StatusMessage }, r.StatusCode
end

-- ---------------------------------------------------------------- ui
local toolbar = plugin:CreateToolbar("Golem")
local button = toolbar:CreateButton("Golem", "Open Golem", "rbxassetid://0")
button.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 300, 380, 260, 300)
local widget = (plugin :: any):CreateDockWidgetPluginGuiAsync("GolemDock", widgetInfo) :: DockWidgetPluginGui
widget.Title = "Golem"

local COLORS = {
	bg = Color3.fromHex("0B0E14"),
	surface = Color3.fromHex("121826"),
	raised = Color3.fromHex("1A2233"),
	line = Color3.fromHex("232D3F"),
	text = Color3.fromHex("E6EAF2"),
	muted = Color3.fromHex("8A94A6"),
	amber = Color3.fromHex("FFB454"),
	green = Color3.fromHex("34D399"),
	red = Color3.fromHex("F87171"),
}

local root = Instance.new("Frame")
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = COLORS.bg
root.BorderSizePixel = 0
root.Parent = widget

local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 10)
layout.SortOrder = Enum.SortOrder.LayoutOrder
layout.Parent = root
local pad = Instance.new("UIPadding")
pad.PaddingTop = UDim.new(0, 14)
pad.PaddingBottom = UDim.new(0, 14)
pad.PaddingLeft = UDim.new(0, 14)
pad.PaddingRight = UDim.new(0, 14)
pad.Parent = root

local function label(text: string, size: number, color: Color3, order: number): TextLabel
	local l = Instance.new("TextLabel")
	l.Text = text
	l.Font = Enum.Font.GothamBold
	l.TextSize = size
	l.TextColor3 = color
	l.BackgroundTransparency = 1
	l.Size = UDim2.new(1, 0, 0, size + 6)
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.LayoutOrder = order
	l.TextWrapped = true
	l.Parent = root
	return l
end

local title = label("GOLEM", 18, COLORS.amber, 1)
title.Font = Enum.Font.GothamBlack
local statusLabel = label("Not connected", 14, COLORS.muted, 2)
local projectLabel = label("", 13, COLORS.text, 3)
projectLabel.Visible = false

local codeBox = Instance.new("TextBox")
codeBox.PlaceholderText = "Pairing code (e.g. K7M3QP)"
codeBox.Text = ""
codeBox.Font = Enum.Font.Code
codeBox.TextSize = 16
codeBox.TextColor3 = COLORS.text
codeBox.PlaceholderColor3 = COLORS.muted
codeBox.BackgroundColor3 = COLORS.surface
codeBox.BorderSizePixel = 0
codeBox.Size = UDim2.new(1, 0, 0, 38)
codeBox.LayoutOrder = 4
codeBox.ClearTextOnFocus = false
codeBox.Parent = root
local codeCorner = Instance.new("UICorner")
codeCorner.CornerRadius = UDim.new(0, 8)
codeCorner.Parent = codeBox

local connectBtn = Instance.new("TextButton")
connectBtn.Text = "Connect"
connectBtn.Font = Enum.Font.GothamBold
connectBtn.TextSize = 15
connectBtn.TextColor3 = Color3.fromHex("1A1206")
connectBtn.BackgroundColor3 = COLORS.amber
connectBtn.BorderSizePixel = 0
connectBtn.Size = UDim2.new(1, 0, 0, 38)
connectBtn.LayoutOrder = 5
connectBtn.Parent = root
local btnCorner = Instance.new("UICorner")
btnCorner.CornerRadius = UDim.new(0, 8)
btnCorner.Parent = connectBtn

local activityLabel = label("", 12, COLORS.muted, 6)
activityLabel.Size = UDim2.new(1, 0, 0, 120)
activityLabel.TextYAlignment = Enum.TextYAlignment.Top
activityLabel.Font = Enum.Font.Code

local hint = label("Get a code from your project page at Golem → Connect Studio.", 12, COLORS.muted, 7)
hint.Font = Enum.Font.Gotham

-- Diagnostics. When a user reports "Golem is broken", the first question is always
-- which build they are on, and they have no other way to find out: Studio's plugin
-- manager shows the asset, not the version string this code was compiled with.
local versionLabel = label("Golem v" .. VERSION .. " · protocol " .. tostring(PROTOCOL), 11, COLORS.muted, 8)
versionLabel.Font = Enum.Font.Code

-- Populated only when the server has something to say about this build. Hidden the
-- rest of the time, which is the overwhelmingly common case.
local noticeLabel = label("", 12, COLORS.amber, 9)
noticeLabel.Font = Enum.Font.Gotham
noticeLabel.Visible = false

button.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)

local function setStatus(text: string, color: Color3)
	statusLabel.Text = text
	statusLabel.TextColor3 = color
end

local function pushActivity(line: string)
	table.insert(recentOps, 1, line)
	if #recentOps > 7 then table.remove(recentOps) end
	activityLabel.Text = table.concat(recentOps, "\n")
end

-- The server's verdict on this build, rendered honestly.
--
-- `compatible == false` is the only state that actually blocks work, and it is the
-- only one painted red. Everything else is advisory: a newer build exists, which is
-- worth mentioning once and then leaving alone. Roblox has no automatic plugin
-- updating — Studio has per-plugin Update buttons the user must click, confirmed by
-- Roblox staff as recently as 2026-04 — so the message names that exact mechanism
-- instead of vaguely telling someone to "update".
local function applyClientNotice(client: any)
	if type(client) ~= "table" then return end
	local message = type(client.message) == "string" and client.message or nil
	if client.compatible == false then
		noticeLabel.Text = message or "This Golem build is too old for the server. Update it in Studio: Plugins → Manage Plugins → Update."
		noticeLabel.TextColor3 = COLORS.red
		noticeLabel.Visible = true
		return
	end
	if not message then
		noticeLabel.Visible = false
		return
	end
	noticeLabel.Text = message
	noticeLabel.TextColor3 = COLORS.amber
	noticeLabel.Visible = true
	-- The label is passive and can sit there indefinitely, but writing to the Output
	-- window every few seconds would be genuine nagging. Do that once per distinct
	-- message, per machine.
	if plugin:GetSetting("golem_notice_seen") ~= message then
		plugin:SetSetting("golem_notice_seen", message)
		warn("[Golem] " .. message)
	end
end

-- ---------------------------------------------------------------- poll loop
local function disconnectSession(reason: string?)
	connected = false
	pollGeneration += 1 -- retire the loop; see stopPolling
	session = nil
	plugin:SetSetting("golem_session", nil)
	projectLabel.Visible = false
	connectBtn.Text = "Connect"
	setStatus(reason or "Not connected", COLORS.muted)
end

--[[ `generation` is the loop's own identity. A loop retired by a reconnect keeps running
	 until it next reaches the top of this while — finishing any op it was in the middle of,
	 which is exactly what makes the shutdown safe — and then stops. ]]
local function pollLoop(generation: number)
	local results: { any } = {}
	local pollCount = 0
	while connected and session and generation == pollGeneration do
		local s = session :: Session
		local events = {}
		for _, e in logBuffer do table.insert(events, e) end
		table.clear(logBuffer)
		local body: any = { results = results, events = events }
		if pollCount % 12 == 0 then body.state = stateEvent() end
		results = {}
		local ok, data, status = post(s.apiBase .. "/api/studio/poll", body, s.token)
		pollCount += 1
		if status == 401 then
			disconnectSession("Session ended — reconnect with a new code")
			break
		end
		if ok and type(data) == "table" then
			applyClientNotice(data.client)
		end
		if ok and type(data) == "table" and data.ops then
			for _, pending in (data.ops :: { any }) do
				pushActivity("▸ " .. tostring(pending.studioOp.op))
				local result = Ops.execute(pending.id, pending.studioOp)
				pushActivity((result.ok and "✓ " or "✗ ") .. tostring(pending.studioOp.op))
				table.insert(results, result)
			end
			if #results > 0 then
				task.wait(0.05) -- report results promptly
			else
				task.wait(math.clamp((data.waitMs or 2000) / 1000, 0.2, 10))
			end
		else
			setStatus("Connection hiccup — retrying…", COLORS.amber)
			task.wait(3)
			if connected then setStatus("Connected · " .. (session and (session :: Session).projectName or ""), COLORS.green) end
		end
	end
end

--[[ Retire the current poll loop, cooperatively.

	 B6: this used to be `task.cancel(pollThread)`. Two things are wrong with that.

	 First, `task.cancel` on a thread that has already finished RAISES, so a reconnect after
	 the loop had exited on its own — a 401, a disconnect — threw from the click handler.

	 Second and much worse, the loop is usually not sitting in a `task.wait`. It spends its
	 time inside `Ops.execute`, which holds an open ChangeHistoryService recording and a
	 relaxed asset policy for the length of an op. Killing the thread there unwinds neither:
	 the recording stays open forever, so every later edit joins one undo entry the user
	 cannot separate, and the asset policy stays open. Nothing in the plugin ever closes them
	 again, because the code that would have is the code that was killed.

	 So nothing is cancelled. The generation bump tells the loop to stop, and it stops after
	 finishing whatever it was doing. ]]
local function stopPolling()
	pollGeneration += 1
end

local function startPolling()
	stopPolling()
	connected = true
	local s = session :: Session
	setStatus("Connected", COLORS.green)
	projectLabel.Text = "Project: " .. s.projectName
	projectLabel.Visible = true
	connectBtn.Text = "Disconnect"
	setStatus("Connected · " .. s.projectName, COLORS.green)
	-- The handle is deliberately not kept. Holding a thread reference implies something can be
	-- done with it, and the only thing that could be is the cancel this fix exists to remove.
	local generation = pollGeneration
	task.spawn(function()
		pollLoop(generation)
	end)
end

local function claimCode(code: string)
	setStatus("Connecting…", COLORS.amber)
	local ok, data, status = post(DEFAULT_API .. "/api/studio/claim", { code = code })
	if not ok or not data or not data.token then
		setStatus(status == 404 and "Invalid or expired code" or "Could not reach Golem — check your internet", COLORS.red)
		return
	end
	session = {
		token = data.token,
		projectId = data.projectId,
		projectName = data.projectName or "project",
		apiBase = DEFAULT_API,
	}
	plugin:SetSetting("golem_session", HttpService:JSONEncode(session))
	codeBox.Text = ""
	startPolling()
end

connectBtn.MouseButton1Click:Connect(function()
	if connected then
		disconnectSession("Disconnected")
		return
	end
	local code = string.gsub(string.upper(codeBox.Text), "[^A-Z0-9]", "")
	if #code < 4 then
		setStatus("Enter the pairing code from the Golem web app", COLORS.red)
		return
	end
	claimCode(code)
end)

if session then
	startPolling()
end

--[[ B5: nothing handled plugin unload, and Studio does not kill a plugin's threads when it
	 reloads one.

	 So the previous script instance kept its `connected` upvalue at true and its poll loop
	 kept running — against the same session token, draining the same op queue — while the
	 freshly loaded instance started a second loop beside it. Each op then went to whichever
	 loop happened to poll first, results came back from a script the user believes is gone,
	 and F-21's nil recording is that same orphaned thread still executing inside `Ops`.

	 Clearing the flags is deliberately all this does. The loop notices at its next check and
	 exits after finishing whatever op it was in the middle of, which is what lets `Ops.execute`
	 close its ChangeHistory recording and restore the asset policy on the way out. Cancelling
	 the thread here would reintroduce exactly the leak B6 removes — see `stopPolling`. ]]
plugin.Unloading:Connect(function()
	connected = false
	pollGeneration += 1
end)

-- Headless pairing (developer convenience, OFF by default).
-- A place-resident script could otherwise drop a StringValue and silently re-point this
-- Studio at somebody else's project, which would hand them code execution here. So it is
-- gated behind an explicit per-machine opt-in and never re-points an active session.
if plugin:GetSetting("golem_allow_headless_pairing") == true then
	task.spawn(function()
		local ServerStorage = game:GetService("ServerStorage")
		while true do
			if not connected then
				local codeValue = ServerStorage:FindFirstChild("GolemPairingCode")
				if codeValue and codeValue:IsA("StringValue") and #codeValue.Value >= 4 then
					local code = string.gsub(string.upper(codeValue.Value), "[^A-Z0-9]", "")
					codeValue:Destroy()
					warn("[Golem] headless pairing opt-in is enabled; claiming code from ServerStorage")
					claimCode(code)
				end
			end
			task.wait(2)
		end
	end)
end
