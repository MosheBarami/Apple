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
PlayCheck.MAX_PRESSES = 5

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
-- F-050: the client presses the listed on-screen buttons BEFORE it describes its screen, so the
-- report (and the leaderstats read after it) show what pressing them did.
local presses = {}
if type(args.press) == "table" then
	for index, target in args.press do
		if index > 5 then break end
		if type(target) == "table" and type(target.segments) == "table" then
			table.insert(presses, { path = clip(target.path, 320), segments = target.segments })
		end
	end
end
pcall(function() channel:FireClient(player, { nonce = args.nonce, since = since, press = presses }) end)
local reportBy = os.clock() + 6 + 4 * #presses
while clientReport == nil and not ended and os.clock() < reportBy do task.wait(0.2) end
if #presses > 0 then report.leaderstatsAfterPresses = stats() end
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
-- F-050. A press is a real mouse click at the button's centre, sent through VirtualInput, so the
-- button's own Activated / MouseButton1Click handlers run exactly as a player's click would run
-- them. Nothing here fires a signal directly or calls a handler: if VirtualInput is unavailable the
-- press is reported as not pressed, never as pressed.
--
-- What a press changed is read from the player's own screen and state just before the click and
-- again after the wait: every GuiObject's visibility and text under each ScreenGui (keyed by its
-- path), the leaderstats, the Humanoid's movement and health, and the player's attributes.
local function observe(player, playerGui)
	local view = { order = {}, nodes = {}, valueOrder = {}, values = {} }
	for _, gui in playerGui:GetChildren() do
		if gui:IsA("ScreenGui") and #view.order < 300 then
			local okEnabled, enabled = pcall(function() return gui.Enabled end)
			enabled = okEnabled and enabled ~= false
			local keys = { [gui] = clip(gui.Name, 60) }
			view.nodes[keys[gui]] = { shown = enabled }
			table.insert(view.order, keys[gui])
			for _, node in gui:GetDescendants() do
				if #view.order >= 300 then break end
				local parentKey = keys[node.Parent]
				if parentKey then
					local key = parentKey .. "." .. clip(node.Name, 60)
					if view.nodes[key] then key ..= "#" .. #view.order end
					keys[node] = key
					if node:IsA("GuiObject") then
						local okText, text = pcall(function() return node.Text end)
						view.nodes[key] = { shown = enabled and shown(node, gui), text = if okText and type(text) == "string" then clip(text, 80) else nil, parent = parentKey }
						table.insert(view.order, key)
					end
				end
			end
		end
	end
	local function put(key, value)
		if value ~= nil and #view.valueOrder < 40 then view.values[key] = clip(value, 60); table.insert(view.valueOrder, key) end
	end
	local stats = player:FindFirstChild("leaderstats")
	if stats then
		for _, value in stats:GetChildren() do
			if value:IsA("ValueBase") then pcall(function() put("leaderstats " .. clip(value.Name, 40), value.Value) end) end
		end
	end
	local okHumanoid, humanoid = pcall(function() return player.Character:FindFirstChildOfClass("Humanoid") end)
	if okHumanoid and humanoid then
		for _, name in { "WalkSpeed", "JumpPower", "JumpHeight", "Health", "MaxHealth" } do pcall(function() put(name, humanoid[name]) end) end
	end
	local okAttributes, attributes = pcall(function() return player:GetAttributes() end)
	if okAttributes and type(attributes) == "table" then
		for name, value in attributes do put("attribute " .. clip(name, 40), value) end
	end
	return view
end
-- One line per change, at most 12. A panel that opens is one line, not one per element inside it.
local function changes(before, after)
	local out, more = {}, false
	local function add(text) if #out < 12 then table.insert(out, clip(text, 200)) else more = true end end
	for _, key in after.order do
		local now, was = after.nodes[key], before.nodes[key]
		if was == nil then
			if not (now.parent and after.nodes[now.parent] and before.nodes[now.parent] == nil) then
				add(key .. " appeared" .. (if now.shown then "" else " (hidden)") .. (if now.text then ' with text "' .. now.text .. '"' else ""))
			end
		else
			local parentNow, parentWas = now.parent and after.nodes[now.parent], now.parent and before.nodes[now.parent]
			if now.shown ~= was.shown and not (parentNow and parentWas and parentNow.shown ~= parentWas.shown) then
				add(key .. (if now.shown then " became visible" else " was hidden"))
			end
			if now.text ~= nil and was.text ~= nil and now.text ~= was.text then add(key .. ' text "' .. was.text .. '" → "' .. now.text .. '"') end
		end
	end
	for _, key in before.order do
		local was = before.nodes[key]
		if after.nodes[key] == nil and not (was.parent and before.nodes[was.parent] and after.nodes[was.parent] == nil) then add(key .. " was removed") end
	end
	for _, key in after.valueOrder do
		if before.values[key] ~= after.values[key] then add(key .. " " .. (before.values[key] or "none") .. " → " .. after.values[key]) end
	end
	for _, key in before.valueOrder do
		if after.values[key] == nil then add(key .. " " .. before.values[key] .. " → none") end
	end
	return out, more
end
-- The buttons a player could press right now, named the way a press names them.
local function buttonsOn(playerGui)
	local out = {}
	local prefix = #playerGui:GetFullName() + 2
	for _, node in playerGui:GetDescendants() do
		if #out >= 8 then break end
		local screen = node:IsA("GuiButton") and node:FindFirstAncestorOfClass("ScreenGui")
		if screen and screen.Enabled ~= false and shown(node, playerGui) then
			table.insert(out, clip("game.StarterGui." .. string.sub(node:GetFullName(), prefix), 200))
		end
	end
	return out
end
local function pressAll(player, playerGui, list)
	local results = {}
	if type(list) ~= "table" or #list == 0 then return results end
	local UserInputService = game:GetService("UserInputService")
	local GuiService = game:GetService("GuiService")
	local okVirtual, virtual = pcall(function() return UserInputService:CreateVirtualInput() end)
	for index, target in list do
		if index > 5 then break end
		local entry = { path = clip(target.path, 320), found = false, pressed = false, activations = 0 }
		-- segments are relative to StarterGui: the ScreenGui is copied into PlayerGui under its name,
		-- or a LocalScript builds it there (next to the script's own copy, which may share the name).
		local node = playerGui
		local waitUntil = os.clock() + 3
		local function find(parent, segment)
			if parent ~= playerGui then return parent:FindFirstChild(segment) end
			for _, child in parent:GetChildren() do
				if child.Name == segment and child:IsA("ScreenGui") then return child end
			end
			return nil
		end
		for _, segment in target.segments do
			if node == nil then break end
			local child = find(node, segment)
			while child == nil and os.clock() < waitUntil do task.wait(0.1); child = find(node, segment) end
			node = child
		end
		if node and node:IsA("GuiButton") then
			entry.found = true
			entry.visible = shown(node, playerGui)
			local screen = node:FindFirstAncestorOfClass("ScreenGui")
			if screen and not screen.Enabled then entry.visible = false end
			if not entry.visible then
				entry.error = "the button is not visible on the player's screen, so a player could not press it"
			elseif not okVirtual or virtual == nil then
				entry.error = "Studio did not provide VirtualInput (UserInputService:CreateVirtualInput), so the button was not pressed"
			else
				local fired = 0
				local connections = {}
				pcall(function() table.insert(connections, node.Activated:Connect(function() fired += 1 end)) end)
				local centre = node.AbsolutePosition + node.AbsoluteSize / 2
				if screen and not screen.IgnoreGuiInset then
					local okInset, inset = pcall(function() return GuiService:GetGuiInset() end)
					if okInset and inset then centre += inset end
				end
				local before = observe(player, playerGui)
				local okPress, pressErr = pcall(function()
					virtual:SendMouseButton(centre, Enum.UserInputType.MouseButton1, true)
					task.wait(0.05)
					virtual:SendMouseButton(centre, Enum.UserInputType.MouseButton1, false)
				end)
				task.wait(1)
				for _, connection in connections do connection:Disconnect() end
				entry.pressed = okPress
				entry.activations = fired
				entry.activated = fired > 0
				if not okPress then entry.error = clip(pressErr, 200) end
				if okPress then entry.changes, entry.changesTruncated = changes(before, observe(player, playerGui)) end
			end
		elseif node then
			entry.error = "the path is not a GuiButton (TextButton or ImageButton)"
		else
			entry.error = "the button did not appear in the player's PlayerGui"
			entry.buttonsOnScreen = buttonsOn(playerGui)
		end
		table.insert(results, entry)
	end
	pcall(function() if virtual then virtual:Destroy() end end)
	return results
end

channel.OnClientEvent:Connect(function(request)
	if type(request) ~= "table" or request.nonce ~= marker then return end
	local player = Players.LocalPlayer
	local playerGui = player and player:FindFirstChild("PlayerGui")
	local presses = if playerGui then pressAll(player, playerGui, request.press) else {}
	local guis, others = census(playerGui)
	local errors, warnings = collectLogs(LogService, tonumber(request.since) or 0, scriptErrors)
	channel:FireServer({ nonce = marker, playerGui = playerGui ~= nil, screenGuis = guis, otherChildren = others, errors = errors, warnings = warnings, presses = presses })
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

local function textList(raw: any, limit: number): { string }?
	if type(raw) ~= "table" then return nil end
	local out = {}
	for _, item in raw do
		if #out >= limit then break end
		if type(item) == "string" then table.insert(out, clipText(item, 200)) end
	end
	return out
end

local function pressList(raw: any): { any }
	local out = {}
	if type(raw) ~= "table" then return out end
	for _, item in raw do
		if #out >= PlayCheck.MAX_PRESSES then break end
		if type(item) == "table" then
			table.insert(out, {
				path = clipText(item.path, 320), found = item.found == true,
				visible = if item.visible == nil then nil else item.visible == true,
				pressed = item.pressed == true, activated = item.activated == true,
				activations = if type(item.activations) == "number" then math.clamp(math.floor(item.activations), 0, 1000) else 0,
				error = if item.error ~= nil then clipText(item.error, 200) else nil,
				-- nil when nothing was observed (not pressed); an empty list when a press changed nothing.
				changes = textList(item.changes, 12),
				changesTruncated = item.changesTruncated == true or nil,
				buttonsOnScreen = textList(item.buttonsOnScreen, 8),
			})
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
		presses = if client then pressList(client.presses) else {},
		leaderstatsAfterPresses = statList(report.leaderstatsAfterPresses),
	}
end

--[[
	Run one check. `ctx` = { game, services, editor, seconds, touch = { { path, segments } }, press = { { path, segments } }?, nonce? }.
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
		press = ctx.press or {},
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
