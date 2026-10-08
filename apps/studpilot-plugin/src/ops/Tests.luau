--!nocheck
-- StudPilot Studio op family: RUN_TESTS (plugin 2.0).
--
--   run_tests  (consent)  run the place's TestEZ specs (ModuleScripts named *.spec) in a solo Test
--                         session and report passed / failed / skipped with each failure's message
--
-- The specs run in the Test session's copy of the place, from a temporary runner Script that
-- PlayCheck.runTests inserts and removes (the same harness rules as play_check), never in the plugin.
-- TestEZ must already be in the place: StudPilot does not ship it (THIRD_PARTY_NOTICES.md).

local Tests = {}
Tests.name = "tests"
Tests.SEARCH = { "ReplicatedStorage", "ServerStorage", "ServerScriptService", "ReplicatedFirst", "StarterPlayer" }
Tests.DEFAULT_ROOTS = { "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterPlayer", "ReplicatedFirst" }
Tests.MAX_ROOTS = 10

function Tests.build(api)
	local function slashPath(self, inst): string?
		local names = {}
		local current = inst
		local guard = 0
		while current ~= nil and current ~= self.game do
			guard += 1
			if guard > 64 then return nil end
			local name = api.nameOf(current)
			if string.find(name, "/", 1, true) then return nil end
			table.insert(names, 1, name)
			current = api.parentOf(current)
		end
		if current ~= self.game then return nil end
		return table.concat(names, "/")
	end

	local function findTestEZ(self)
		for _, serviceName in Tests.SEARCH do
			local service = api.serviceFrom(self.game, self.options.services, serviceName)
			for _, node in (service and api.descendantsOf(service)) or {} do
				if api.classNameOf(node) == "ModuleScript" and string.lower(api.nameOf(node)) == "testez" then return node end
			end
		end
		return nil
	end

	local function handleRunTests(self, op)
		if not self.playCheck or type(self.playCheck.runTests) ~= "function" then
			return nil, "refused", self.playCheckError or "Studio test sessions are unavailable in this plugin build", "none"
		end
		if self.activeRecording ~= nil or self.activeGeneration ~= nil or self.activePlayCheck then
			return nil, "conflict", "another StudPilot operation is still in progress"
		end
		if self.studpilotRun ~= nil then return nil, "conflict", "StudPilot's Run-mode playtest is still active; stop it first", "leave_test_mode" end
		local testez = findTestEZ(self)
		if testez == nil then
			return nil, "refused", "TestEZ is not in this place. Add TestEZ (github.com/Roblox/testez) as a ModuleScript named TestEZ, for example in ReplicatedStorage, then run the tests again.", "none"
		end
		local rootList = op.roots
		if rootList == nil then rootList = {} for _, name in Tests.DEFAULT_ROOTS do table.insert(rootList, "game." .. name) end end
		if type(rootList) ~= "table" or #rootList == 0 or #rootList > Tests.MAX_ROOTS then return nil, "invalid", ("run_tests.roots must be a list of 1-%d paths"):format(Tests.MAX_ROOTS) end
		local roots, specs = {}, {}
		for _, raw in rootList do
			local inst, canonical, err, pathKind = api.resolvePath(self.game, self.options.services, raw, false, self)
			if inst then
				local path = slashPath(self, inst)
				if path == nil then return nil, "invalid", "run_tests cannot address " .. tostring(canonical) .. " (a name contains '/')" end
				table.insert(roots, path)
				for _, node in api.descendantsOf(inst) or {} do
					if api.classNameOf(node) == "ModuleScript" and string.match(api.nameOf(node), "%.spec$") then table.insert(specs, api.fullPath(self.game, node)) end
				end
			elseif pathKind ~= "not_found" or op.roots ~= nil then
				return nil, pathKind or "not_found", err
			end
		end
		if #specs == 0 then
			return { passed = 0, failed = 0, skipped = 0, specs = 0, failures = {}, errors = {}, note = "no ModuleScript named *.spec under the roots, so nothing ran" }
		end
		local seconds, secondsErr = api.safeCount(op.timeoutSeconds, 40, 5, 50, "run_tests.timeoutSeconds")
		if not seconds then return nil, "invalid", secondsErr end
		self.activePlayCheck = true
		local ok, data, kind, message, remedy = pcall(self.playCheck.runTests, {
			game = self.game, services = self.options.services, editor = self.editor,
			testez = slashPath(self, testez), roots = roots, deadline = seconds,
		})
		self.activePlayCheck = false
		if not ok then return nil, "internal", tostring(data) end
		if data == nil then return nil, kind or "internal", message or "run_tests failed", remedy end
		data.specs = #specs
		data.specPaths = { table.unpack(specs, 1, math.min(#specs, 50)) }
		data.testez = api.fullPath(self.game, testez)
		return data
	end

	return {
		handlers = { run_tests = handleRunTests },
		consentOnly = { run_tests = true },
	}
end

return Tests
