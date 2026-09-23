--!nocheck
-- Apple Studio: the bounded PLAYER-SIDE check (F-046).
--
-- WHY THIS EXISTS. `run_mode` is RunService:Run(): a server-only simulation with no player, so a
-- coin counter, a LocalScript HUD or a client error can never be exercised by it. On 2026-09-23 a
-- customer was told a HUD "is verified" while in a real Test session its LocalScript errored and
-- PlayerGui held no ScreenGui at all. This module starts a real solo Test session with a player,
-- through the Studio automated-test API, and reports what that player actually had on screen.
--
-- THE API, as documented in the Engine reference (StudioTestService, read 2026-09-23):
--   ExecutePlayModeAsync(args: Variant): Variant   PluginSecurity, Yields. Starts a solo Test
--       session and yields until it ends. Returns the value passed to EndTest, or nil if the test
--       ended by other means. Errors if a test session is already running.
--   GetTestArgs(): Variant   returns `args` in the session; documented as unreliable from a
--       client LocalScript, so only the SERVER harness reads it.
--   EndTest(value: Variant)  must be called from the server DataModel of the running test.
--
-- WHAT RUNS, AND WHY IT IS NOT "RECEIVED LUAU". The two harness sources below are fixed text that
-- ships inside this plugin. Nothing from the wire becomes code: the worker sends only a number of
-- seconds and a list of paths, and the paths are resolved against the place by Commands.luau before
-- anything is inserted. The harness does nothing at all unless GetTestArgs() carries this run's
-- nonce AND its own attribute carries the same nonce, so a copy that somehow survived could never
-- act in a customer's own playtest or a live server.
--
-- THE HARNESS NEVER STAYS IN THE PLACE. It is inserted immediately before the session, removed
-- immediately after it in edit mode on every path (including a session that errored or was
-- stopped by hand), and the removal is COUNTED rather than assumed: the result says how many marked
-- instances remain, and a non-zero count is reported as a failure of this check.

local PlayCheck = {}

local MARKER = "__ApplePlayCheckHarnessV1"
PlayCheck.MARKER = MARKER
PlayCheck.SERVER_NAME = "ApplePlayCheckServer"
PlayCheck.CLIENT_NAME = "ApplePlayCheckClient"
PlayCheck.MIN_SECONDS = 3
PlayCheck.MAX_SECONDS = 15
PlayCheck.MAX_TOUCHES = 5

-- Shared census code, spliced into both harnesses so the server fallback and the client report
-- describe a PlayerGui the same way.
local CENSUS = [==[
local function clip(value, limit)
	local text = tostring(value)
	if #text > limit then text = string.sub(text, 1, limit) .. "…" end
	return text
end
local function shown(node, root)
	local current = node
	local depth = 0
	while current and current ~= root and depth < 64 do
		depth += 1
		local okVisible, visible = pcall(function() return current.Visible end)
		if okVisible and visible == false then return false end
		current = current.Parent
	end
	return current == root
end
local function census(playerGui)
	local guis, others, texts = {}, {}, 0
	if not playerGui then return guis, others end
	for _, child in playerGui:GetChildren() do
		if child:IsA("ScreenGui") then
			if #guis < 10 then
				local okEnabled, enabled = pcall(function() return child.Enabled end)
				local entry = { name = clip(child.Name, 60), enabled = okEnabled and enabled ~= false, labels = {} }
				for _, node in child:GetDescendants() do
					if node:IsA("TextLabel") or node:IsA("TextButton") or node:IsA("TextBox") then
						if texts >= 40 then entry.truncated = true break end
						texts += 1
						local okText, value = pcall(function() return node.Text end)
						table.insert(entry.labels, {
							name = clip(node.Name, 60), class = node.ClassName,
							text = if okText then clip(value, 120) else "",
							visible = entry.enabled and shown(node, child),
						})
					end
				end
				table.insert(guis, entry)
			end
		elseif #others < 10 then
			table.insert(others, { name = clip(child.Name, 60), class = child.ClassName })
		end
	end
	return guis, others
end
local function kindOf(messageType)
	local text = tostring(messageType)
	if string.find(text, "Error", 1, true) then return "error" end
	if string.find(text, "Warning", 1, true) then return "warning" end
	return nil
end
local function collectLogs(logService, since, scriptErrors)
	local errors, warnings, seen = {}, {}, {}
	local function add(list, message, source)
		local text = clip(message, 300)
		if seen[text] or string.find(text, "ApplePlayCheck", 1, true) then return end
		seen[text] = true
		if #list < 30 then table.insert(list, { message = text, source = source }) end
	end
	for _, item in scriptErrors do add(errors, item.message, item.source) end
	local okHistory, history = pcall(function() return logService:GetLogHistory() end)
	if okHistory and type(history) == "table" then
		for _, entry in history do
			local stamp = tonumber(entry.timestamp)
			if stamp == nil or stamp >= since then
				local kind = kindOf(entry.messageType)
				if kind == "error" then add(errors, entry.message, nil)
				elseif kind == "warning" then add(warnings, entry.message, nil) end
			end
		end
	end
	return errors, warnings
end
local function watchErrors(scriptContext, into)
	pcall(function()
		scriptContext.Error:Connect(function(message, _trace, source)
			if #into >= 30 then return end
			local where = nil
			if source then pcall(function() where = clip(source:GetFullName(), 160) end) end
			table.insert(into, { message = message, source = where })
		end)
	end)
end
]==]

PlayCheck.SERVER_SOURCE = "-- Apple play check (temporary; removed after the test session).\n" .. CENSUS .. [==[
local MARKER = "__ApplePlayCheckHarnessV1"
local okService, StudioTestService = pcall(function() return game:GetService("StudioTestService") end)
if not okService or not StudioTestService then return end
local okArgs, args = pcall(function() return StudioTestService:GetTestArgs() end)
if not okArgs or type(args) ~= "table" or args.applePlayCheck ~= 1 or type(args.nonce) ~= "string" then return end
if script:GetAttribute(MARKER) ~= args.nonce then return end

local Players = game:GetService("Players")
local LogService = game:GetService("LogService")
local ScriptContext = game:GetService("ScriptContext")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local started = os.clock()
local since = tonumber(args.since) or 0
local seconds = math.clamp(tonumber(args.seconds) or 5, 3, 15)
local scriptErrors = {}
watchErrors(ScriptContext, scriptErrors)

local report = { nonce = args.nonce, harness = 1, stage = "started", touches = {} }
local ended = false
local clientReport = nil
local channel = Instance.new("RemoteEvent")
channel.Name = "ApplePlayCheckChannel"
channel:SetAttribute(MARKER, args.nonce)

local function finish(stage)
	if ended then return end
	ended = true
	report.stage = stage
	report.elapsedSeconds = math.floor((os.clock() - started) * 10) / 10
	report.serverErrors, report.serverWarnings = collectLogs(LogService, since, scriptErrors)
	report.client = clientReport
	pcall(function() channel:Destroy() end)
	pcall(function() StudioTestService:EndTest(report) end)
end
-- The hard bound. Whatever the place does, the session ends and the plugin gets an answer.
task.delay(50, function() finish("deadline") end)

local player = nil
channel.OnServerEvent:Connect(function(sender, payload)
	if sender == player and type(payload) == "table" and payload.nonce == args.nonce and clientReport == nil then
		clientReport = payload
	end
end)
channel.Parent = ReplicatedStorage

local function stats()
	if not player then return nil end
	local folder = player:FindFirstChild("leaderstats")
	if not folder then return nil end
	local out = {}
	for _, value in folder:GetChildren() do
		if #out >= 12 then break end
		if value:IsA("ValueBase") then
			local okValue, current = pcall(function() return value.Value end)
			table.insert(out, { name = clip(value.Name, 60), value = if okValue and type(current) == "number" then current else clip(current, 60) })
		end
	end
	return out
end

local joinBy = os.clock() + 20
player = Players:GetPlayers()[1]
while not player and not ended and os.clock() < joinBy do task.wait(0.25); player = Players:GetPlayers()[1] end
if ended then return end
if not player then finish("no_player") return end
report.playerJoined = true
local character = player.Character
while not character and not ended and os.clock() < joinBy do task.wait(0.25); character = player.Character end
if ended then return end
if not character then finish("no_character") return end
report.characterSpawned = true
report.leaderstatsBefore = stats()

task.wait(seconds)
if ended then return end
report.waitedSeconds = seconds

if type(args.touch) == "table" then
	for index, target in args.touch do
		if index > 5 or ended then break end
		local entry = { path = clip(target.path, 320), found = false }
		local node = game
		if type(target.segments) == "table" then
			for _, segment in target.segments do
				if node == nil then break end
				node = node:FindFirstChild(segment)
			end
		else
			node = nil
		end
		if node and (node:IsA("BasePart") or node:IsA("Model")) then
			entry.found = true
			local okPosition, position = pcall(function()
				if node:IsA("BasePart") then return node.Position end
				return node:GetPivot().Position
			end)
			if okPosition and position then
				entry.moved = pcall(function() character:PivotTo(CFrame.new(position)) end)
				task.wait(1)
				if ended then return end
				entry.leaderstatsAfter = stats()
				entry.stillInPlace = node.Parent ~= nil
				if node:IsA("BasePart") then
					local okT, transparency = pcall(function() return node.Transparency end)
					if okT then entry.transparency = transparency end
				end
			end
		end
		table.insert(report.touches, entry)
	end
end
report.leaderstatsAfter = stats()

local okGui, playerGui = pcall(function() return player:FindFirstChild("PlayerGui") end)
if okGui and playerGui then
	report.serverViewGuis, report.serverViewOthers = census(playerGui)
end
pcall(function() channel:FireClient(player, { nonce = args.nonce, since = since }) end)
local reportBy = os.clock() + 6
while clientReport == nil and not ended and os.clock() < reportBy do task.wait(0.2) end
finish("done")
]==]

PlayCheck.CLIENT_SOURCE = "-- Apple play check (temporary; removed after the test session).\n" .. CENSUS .. [==[
local MARKER = "__ApplePlayCheckHarnessV1"
local marker = script:GetAttribute(MARKER)
if type(marker) ~= "string" then return end
local Players = game:GetService("Players")
local LogService = game:GetService("LogService")
local ScriptContext = game:GetService("ScriptContext")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local scriptErrors = {}
watchErrors(ScriptContext, scriptErrors)
local channel = ReplicatedStorage:WaitForChild("ApplePlayCheckChannel", 30)
if not channel or channel:GetAttribute(MARKER) ~= marker then return end
channel.OnClientEvent:Connect(function(request)
	if type(request) ~= "table" or request.nonce ~= marker then return end
	local player = Players.LocalPlayer
	local playerGui = player and player:FindFirstChild("PlayerGui")
	local guis, others = census(playerGui)
	local errors, warnings = collectLogs(LogService, tonumber(request.since) or 0, scriptErrors)
	channel:FireServer({ nonce = marker, playerGui = playerGui ~= nil, screenGuis = guis, otherChildren = others, errors = errors, warnings = warnings })
end)
]==]

local function service(gameRef: any, services: any, name: string): any
	if services and services[name] ~= nil then return services[name] end
	if gameRef == nil then return nil end
	local ok, value = pcall(function() return gameRef:GetService(name) end)
	if ok then return value end
	return nil
end

-- Every marked instance under the containers the harness is ever put in. Counted, not assumed.
local function marked(containers: { any }): { any }
	local found = {}
	for _, container in containers do
		local ok, descendants = pcall(function() return container:GetDescendants() end)
		if ok and type(descendants) == "table" then
			for _, node in descendants do
				local okAttr, value = pcall(function() return node:GetAttribute(MARKER) end)
				if okAttr and value ~= nil then table.insert(found, node) end
			end
		end
	end
	return found
end

local function sweep(containers: { any }): number
	for _, node in marked(containers) do
		pcall(function() node:Destroy() end)
	end
	return #marked(containers)
end

-- Whether this Studio can run the check at all. Fixed for the life of the Studio build, so the
-- capability report can say it once per pairing.
function PlayCheck.available(gameRef: any, services: any): (boolean, string?)
	local studioTest = service(gameRef, services, "StudioTestService")
	if studioTest == nil then return false, "StudioTestService is unavailable in this Studio session" end
	local ok, method = pcall(function() return studioTest.ExecutePlayModeAsync end)
	if not ok or type(method) ~= "function" then
		return false, "this Studio build does not expose StudioTestService:ExecutePlayModeAsync"
	end
	return true
end

local function clipText(value: any, limit: number): string
	local text = if type(value) == "string" then value else tostring(value)
	if #text > limit then text = string.sub(text, 1, limit) .. "…" end
	return text
end

-- The report crossed a test session and was assembled next to the customer's scripts, so it is
-- bounded again here rather than trusted.
local function logList(raw: any): { any }
	local out = {}
	if type(raw) ~= "table" then return out end
	for _, item in raw do
		if #out >= 30 then break end
		if type(item) == "table" and item.message ~= nil then
			table.insert(out, { message = clipText(item.message, 300), source = if type(item.source) == "string" then clipText(item.source, 160) else nil })
		end
	end
	return out
end

local function statList(raw: any): { any }?
	if type(raw) ~= "table" then return nil end
	local out = {}
	for _, item in raw do
		if #out >= 12 then break end
		if type(item) == "table" and item.name ~= nil then
			table.insert(out, { name = clipText(item.name, 60), value = if type(item.value) == "number" then item.value else clipText(item.value, 60) })
		end
	end
	return out
end

local function guiList(raw: any): { any }
	local out = {}
	if type(raw) ~= "table" then return out end
	for _, gui in raw do
		if #out >= 10 then break end
		if type(gui) == "table" then
			local labels = {}
			if type(gui.labels) == "table" then
				for _, label in gui.labels do
					if #labels >= 40 then break end
					if type(label) == "table" then
						table.insert(labels, {
							name = clipText(label.name, 60), class = clipText(label.class, 40),
							text = clipText(label.text or "", 120), visible = label.visible == true,
						})
					end
				end
			end
			table.insert(out, { name = clipText(gui.name, 60), enabled = gui.enabled == true, labels = labels, truncated = gui.truncated == true or nil })
		end
	end
	return out
end

local function otherList(raw: any): { any }
	local out = {}
	if type(raw) ~= "table" then return out end
	for _, item in raw do
		if #out >= 10 then break end
		if type(item) == "table" then table.insert(out, { name = clipText(item.name, 60), class = clipText(item.class, 40) }) end
	end
	return out
end

function PlayCheck.normalise(report: any, seconds: number): any
	local client = if type(report.client) == "table" then report.client else nil
	local touches = {}
	if type(report.touches) == "table" then
		for _, item in report.touches do
			if #touches >= PlayCheck.MAX_TOUCHES then break end
			if type(item) == "table" then
				table.insert(touches, {
					path = clipText(item.path, 320), found = item.found == true, moved = item.moved == true,
					stillInPlace = if item.stillInPlace == nil then nil else item.stillInPlace == true,
					transparency = if type(item.transparency) == "number" then item.transparency else nil,
					leaderstatsAfter = statList(item.leaderstatsAfter),
				})
			end
		end
	end
	local stage = clipText(report.stage or "unknown", 24)
	return {
		completed = stage == "done",
		stage = stage,
		requestedSeconds = seconds,
		waitedSeconds = if type(report.waitedSeconds) == "number" then report.waitedSeconds else nil,
		elapsedSeconds = if type(report.elapsedSeconds) == "number" then report.elapsedSeconds else nil,
		playerJoined = report.playerJoined == true,
		characterSpawned = report.characterSpawned == true,
		clientReported = client ~= nil,
		playerGuiFound = if client then client.playerGui == true else nil,
		screenGuis = if client then guiList(client.screenGuis) else {},
		otherPlayerGuiChildren = if client then otherList(client.otherChildren) else {},
		clientErrors = if client then logList(client.errors) else {},
		clientWarnings = if client then logList(client.warnings) else {},
		serverViewScreenGuis = if client then nil else guiList(report.serverViewGuis),
		serverViewOtherChildren = if client then nil else otherList(report.serverViewOthers),
		serverErrors = logList(report.serverErrors),
		serverWarnings = logList(report.serverWarnings),
		leaderstatsBefore = statList(report.leaderstatsBefore),
		leaderstatsAfter = statList(report.leaderstatsAfter),
		touches = touches,
	}
end

--[[
	Run one check. `ctx` = { game, services, editor, seconds, touch = { { path, segments } }, nonce? }.
	Returns (data) or (nil, kind, message, remedy). The caller has already enforced edit mode and
	the person's edit consent; this function does not widen either.
]]
function PlayCheck.run(ctx: any): (any?, string?, string?, string?)
	local gameRef = ctx.game
	local services = ctx.services
	local available, why = PlayCheck.available(gameRef, services)
	if not available then return nil, "refused", why, "none" end
	local studioTest = service(gameRef, services, "StudioTestService")
	local serverHome = service(gameRef, services, "ServerScriptService")
	local clientHome = service(gameRef, services, "ReplicatedFirst")
	if serverHome == nil or clientHome == nil then return nil, "refused", "ServerScriptService or ReplicatedFirst is unavailable", "none" end
	local editor = ctx.editor
	if not editor or type(editor.UpdateSourceAsync) ~= "function" then
		return nil, "refused", "ScriptEditorService.UpdateSourceAsync is unavailable, so the check's temporary scripts cannot be written", "none"
	end
	local containers = { serverHome, clientHome }

	-- A copy left by a Studio crash mid-session is removed first, so two harnesses never coexist.
	if sweep(containers) > 0 then return nil, "internal", "an earlier play check's temporary scripts could not be removed from the place" end

	local nonce = ctx.nonce or ("%d-%d"):format(math.floor(os.clock() * 1000) % 1000000000, math.random(1, 999999999))
	local inserted = {}
	local function insert(className: string, name: string, parent: any, source: string): string?
		local okNew, node = pcall(function() return Instance.new(className) end)
		if not okNew or not node then return "could not create the check's " .. className end
		table.insert(inserted, node)
		local okSetup, setupErr = pcall(function()
			node.Name = name
			node.Archivable = true
			node:SetAttribute(MARKER, nonce)
			node.Parent = parent
		end)
		if not okSetup then return tostring(setupErr) end
		local okWrite, writeErr = pcall(function() editor:UpdateSourceAsync(node, function() return source end) end)
		if not okWrite then return "could not write the check's script source: " .. tostring(writeErr) end
		return nil
	end
	local function removeAll(): number
		for _, node in inserted do pcall(function() node:Destroy() end) end
		return sweep(containers)
	end

	local insertErr = insert("Script", PlayCheck.SERVER_NAME, serverHome, PlayCheck.SERVER_SOURCE)
		or insert("LocalScript", PlayCheck.CLIENT_NAME, clientHome, PlayCheck.CLIENT_SOURCE)
	if insertErr then
		local left = removeAll()
		return nil, "internal", insertErr .. (if left > 0 then " (and its temporary scripts could NOT be removed)" else "")
	end

	local okTime, since = pcall(os.time)
	local args = {
		applePlayCheck = 1, nonce = nonce, seconds = ctx.seconds,
		since = if okTime and type(since) == "number" then since else 0,
		touch = ctx.touch or {},
	}
	local called, result = pcall(function() return studioTest:ExecutePlayModeAsync(args) end)

	-- Back in edit mode: the harness leaves on EVERY path before anything else is decided.
	local remaining = removeAll()
	local removal = if remaining == 0
		then "The check's temporary scripts were removed from the place."
		else ("%d of the check's temporary scripts could NOT be removed from the place."):format(remaining)

	if not called then
		return nil, "internal", "Studio refused StudioTestService:ExecutePlayModeAsync: " .. clipText(result, 300) .. " " .. removal
	end
	if type(result) ~= "table" or result.nonce ~= nonce then
		return nil, "internal", "the Test session ended without the check's report (it returns nothing when the test is stopped by other means, for example Studio's Stop button), so nothing about the player was observed. " .. removal
	end
	local data = PlayCheck.normalise(result, ctx.seconds)
	data.harnessRemoved = remaining == 0
	if remaining > 0 then data.harnessRemaining = remaining end
	return data
end

return PlayCheck
