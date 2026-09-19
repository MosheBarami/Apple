--!strict
-- Disposable LOCAL Studio proof for checkpoint restore. No HTTP, assets, publication or generation.
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local Commands = require(ServerScriptService:WaitForChild("AppleCommandsUnderRestoreProof"))

local Proof = {}
local ran = false
local MARKER_NAME = "AppleRestoreEngineProofMarker"
local COMMIT_ROOT = "AppleRestoreCommitFixture"
local ROLLBACK_ROOT = "AppleRestoreRollbackFixture"

local function expect(condition: any, message: string)
	if not condition then error(message .. " (expected=true observed=false)", 2) end
end

local function scalarText(value: any): string
	if type(value) == "string" then return string.format("%q", value) end
	if value == nil then return "nil" end
	return tostring(value)
end

local function expectScalar(observed: any, expected: any, label: string)
	if observed ~= expected then
		error(("%s (expected=%s observed=%s)"):format(label, scalarText(expected), scalarText(observed)), 2)
	end
end

local function oneFrame()
	task.wait()
end

local function removeIfPresent(parent: Instance, name: string)
	local found = parent:FindFirstChild(name)
	if found then found:Destroy() end
end

local function sourceOf(scriptObject: LuaSourceContainer): string
	return ScriptEditorService:GetEditorSource(scriptObject)
end

local function writeSource(scriptObject: LuaSourceContainer, source: string)
	ScriptEditorService:UpdateSourceAsync(scriptObject, function(_: string): string return source end)
end

local function cloneTable(value: any, depth: number?): any
	if type(value) ~= "table" then return value end
	local level = depth or 0
	expect(level < 32, "proof table clone exceeded its depth bound")
	local copy = {}
	for key, child in value do copy[cloneTable(key, level + 1)] = cloneTable(child, level + 1) end
	return copy
end

local function measure(report: any, name: string, callback: () -> any)
	local started = os.clock()
	local ok, value = pcall(callback)
	local row: any = { name = name, ok = ok, durationMs = math.max(0, math.floor((os.clock() - started) * 1000)) }
	if ok then row.observed = value else row.error = tostring(value); report.ok = false end
	table.insert(report.checks, row)
end

local function recordPreparation(name: string, callback: () -> ())
	local recording = ChangeHistoryService:TryBeginRecording("Apple restore proof prep " .. name, "Apple restore proof prep")
	expect(recording ~= nil, "ChangeHistoryService refused proof preparation recording " .. name)
	local ok, err = pcall(callback)
	if not ok then
		ChangeHistoryService:FinishRecording(recording :: string, Enum.FinishRecordingOperation.Cancel)
		error(err, 2)
	end
	ChangeHistoryService:FinishRecording(recording :: string, Enum.FinishRecordingOperation.Commit)
	oneFrame()
end

local function captureRecording(operationId: string, callback: () -> any): (any, { any }, { any })
	local expectedName = "Apple restore " .. operationId
	local starts = {}
	local finishes = {}
	local startConnection = ChangeHistoryService.OnRecordingStarted:Connect(function(name: string, displayName: string?)
		if name == expectedName then table.insert(starts, { name = name, displayName = displayName }) end
	end)
	local finishConnection = ChangeHistoryService.OnRecordingFinished:Connect(function(
		name: string,
		displayName: string?,
		identifier: string?,
		operation: any
	)
		if name == expectedName then
			table.insert(finishes, {
				name = name,
				displayName = displayName,
				identifier = identifier,
				operation = tostring(operation),
				committed = operation == Enum.FinishRecordingOperation.Commit,
				cancelled = operation == Enum.FinishRecordingOperation.Cancel,
			})
		end
	end)
	local ok, result = pcall(callback)
	oneFrame()
	startConnection:Disconnect()
	finishConnection:Disconnect()
	if not ok then error(result, 2) end
	return result, starts, finishes
end

local function newPart(parent: Instance, name: string, transparency: number?): Part
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.Transparency = transparency or 0
	part.Parent = parent
	return part
end

local function captureCommitCheckpointState(): any
	local root = Workspace:FindFirstChild(COMMIT_ROOT)
	expectScalar(root ~= nil, true, "commit checkpoint root exists")
	local part = (root :: Instance):FindFirstChild("CheckpointPart")
	local scriptObject = (root :: Instance):FindFirstChild("Logic")
	expectScalar(part ~= nil, true, "commit checkpoint part exists")
	expectScalar(scriptObject ~= nil, true, "commit checkpoint script exists")
	return {
		rootName = (root :: Instance).Name,
		rootVersion = (root :: Instance):GetAttribute("Version"),
		childCount = #(root :: Instance):GetChildren(),
		partName = (part :: Part).Name,
		partTransparency = (part :: Part).Transparency,
		scriptName = (scriptObject :: ModuleScript).Name,
		scriptSource = sourceOf(scriptObject :: ModuleScript),
		extraExists = (root :: Instance):FindFirstChild("LiveExtra") ~= nil,
		livePartExists = (root :: Instance):FindFirstChild("LivePart") ~= nil,
	}
end

local function captureCommitLiveState(): any
	local root = Workspace:FindFirstChild(COMMIT_ROOT)
	expectScalar(root ~= nil, true, "commit live root exists")
	local part = (root :: Instance):FindFirstChild("LivePart")
	local extra = (root :: Instance):FindFirstChild("LiveExtra")
	local scriptObject = (root :: Instance):FindFirstChild("Logic")
	expectScalar(part ~= nil, true, "commit live part exists")
	expectScalar(extra ~= nil, true, "commit live extra exists")
	expectScalar(scriptObject ~= nil, true, "commit live script exists")
	return {
		rootName = (root :: Instance).Name,
		rootVersion = (root :: Instance):GetAttribute("Version"),
		childCount = #(root :: Instance):GetChildren(),
		partName = (part :: Part).Name,
		partTransparency = (part :: Part).Transparency,
		partMarker = (part :: Part):GetAttribute("LiveMarker"),
		extraName = (extra :: Part).Name,
		extraTransparency = (extra :: Part).Transparency,
		extraMarker = (extra :: Part):GetAttribute("LiveMarker"),
		scriptName = (scriptObject :: ModuleScript).Name,
		scriptSource = sourceOf(scriptObject :: ModuleScript),
		checkpointPartExists = (root :: Instance):FindFirstChild("CheckpointPart") ~= nil,
	}
end

local function assertCommitCheckpointState(observed: any, expected: any, label: string)
	for _, field in { "rootName", "rootVersion", "childCount", "partName", "partTransparency", "scriptName", "scriptSource", "extraExists", "livePartExists" } do
		expectScalar(observed[field], expected[field], label .. "." .. field)
	end
end

local function assertCommitLiveState(observed: any, expected: any, label: string)
	for _, field in { "rootName", "rootVersion", "childCount", "partName", "partTransparency", "partMarker", "extraName", "extraTransparency", "extraMarker", "scriptName", "scriptSource", "checkpointPartExists" } do
		expectScalar(observed[field], expected[field], label .. "." .. field)
	end
end

local function captureRollbackLiveState(): any
	local root = Workspace:FindFirstChild(ROLLBACK_ROOT)
	expectScalar(root ~= nil, true, "rollback live root exists")
	local part = (root :: Instance):FindFirstChild("LiveBeforeFailure")
	local guard = (root :: Instance):FindFirstChild("RollbackGuard")
	expectScalar(part ~= nil, true, "rollback live part exists")
	expectScalar(guard ~= nil, true, "rollback live guard exists")
	return {
		rootName = (root :: Instance).Name,
		rootVersion = (root :: Instance):GetAttribute("Version"),
		childCount = #(root :: Instance):GetChildren(),
		partName = (part :: Part).Name,
		partTransparency = (part :: Part).Transparency,
		partMarker = (part :: Part):GetAttribute("LiveMarker"),
		guardName = (guard :: Part).Name,
		guardTransparency = (guard :: Part).Transparency,
		guardMarker = (guard :: Part):GetAttribute("GuardMarker"),
		checkpointPartExists = (root :: Instance):FindFirstChild("CheckpointPart") ~= nil,
	}
end

local function assertRollbackLiveState(observed: any, expected: any, label: string)
	for _, field in { "rootName", "rootVersion", "childCount", "partName", "partTransparency", "partMarker", "guardName", "guardTransparency", "guardMarker", "checkpointPartExists" } do
		expectScalar(observed[field], expected[field], label .. "." .. field)
	end
end

function Proof.run(): any
	expect(not ran, "This disposable restore proof is one-shot; reopen the generated .rbxl before another run")
	ran = true
	expect(RunService:IsStudio(), "This proof may run only in Roblox Studio")
	expect(RunService:IsEdit(), "Stop the playtest and run this proof in Studio edit mode")
	expect(game.PlaceId == 0, "Refusing to mutate a published place; open the disposable restore proof .rbxl")
	local marker = Workspace:FindFirstChild(MARKER_NAME)
	expect(marker ~= nil and marker:GetAttribute("AppleRestoreEngineProof") == true, "Disposable restore proof marker is missing")

	removeIfPresent(Workspace, COMMIT_ROOT)
	removeIfPresent(Workspace, ROLLBACK_ROOT)
	local commands = Commands.new()
	local function stillCurrent(): boolean return RunService:IsEdit() end
	local report: any = {
		schema = 1,
		ok = true,
		engineObserved = true,
		placeId = game.PlaceId,
		checks = {},
	}

	measure(report, "starter_player_protected_containers_are_snapshot_coverage", function()
		local result = commands:execute(
			"restore-proof-starter-player-snapshot",
			{ op = "snapshot", root = "game.StarterPlayer", includeScripts = true, checkpointId = "proof-starter-player" },
			false
		)
		expect(result.ok == true, "StarterPlayer snapshot failed: " .. tostring(result.error))
		expect(result.data.restorable == true and result.data.complete == true, "StarterPlayer supported content is not exactly restorable")
		expect(result.data.coverage == "exact", "StarterPlayer snapshot did not report exact coverage")
		expect(result.data.skipped.StarterPlayerScripts == nil, "StarterPlayerScripts was still skipped")
		expect(result.data.skipped.StarterCharacterScripts == nil, "StarterCharacterScripts was still skipped")
		local protectedContainers = {}
		for _, child in result.data.node.children do
			if child.className == "StarterPlayerScripts" or child.className == "StarterCharacterScripts" then
				protectedContainers[child.className] = child.protectedIdentity == true
			end
		end
		expect(protectedContainers.StarterPlayerScripts == true, "StarterPlayerScripts protected identity was not captured")
		expect(protectedContainers.StarterCharacterScripts == true, "StarterCharacterScripts protected identity was not captured")
		return { exact = true, protectedContainers = protectedContainers }
	end)

	measure(report, "default_new_place_restorable_supported_subset", function()
		local result = commands:execute(
			"restore-proof-place-snapshot",
			{ op = "snapshot", root = "game", includeScripts = true, checkpointId = "proof-place-coverage" },
			false
		)
		expect(result.ok == true, "whole-place snapshot failed: " .. tostring(result.error))
		expect(result.data.complete == false, "whole-place snapshot claimed exact completeness while Camera/Terrain are preserved")
		expect(result.data.wholePlaceComplete == false, "wholePlaceComplete was true for a bounded subset")
		expect(result.data.restorable == true and result.data.coverage == "supported-subset", "default new-place snapshot was not a restorable supported subset")
		expect(next(result.data.skipped) == nil, "default new-place snapshot silently skipped content")
		local protectedClasses = {}
		for _, entry in result.data.protected do protectedClasses[entry.className] = true end
		for _, className in { "Camera", "Terrain", "ChatWindowConfiguration", "ChatInputBarConfiguration", "ChannelTabsConfiguration", "BubbleChatConfiguration" } do
			expect(protectedClasses[className] == true, "default protected coverage omitted " .. className)
		end
		return { coverage = result.data.coverage, restorable = result.data.restorable, skipped = result.data.skipped, protectedCount = #result.data.protected }
	end)

	local commitSnapshot: any = nil
	measure(report, "restore_commit_single_recording_undo_redo", function()
		recordPreparation("commit-checkpoint-state", function()
			local root = Instance.new("Folder")
			root.Name = COMMIT_ROOT
			root:SetAttribute("Version", "checkpoint")
			root.Parent = Workspace
			newPart(root, "CheckpointPart", 0.25)
			local scriptObject = Instance.new("ModuleScript")
			scriptObject.Name = "Logic"
			scriptObject.Parent = root
				writeSource(scriptObject, "return \"checkpoint\"\n")
			end)
			local checkpointExpected = captureCommitCheckpointState()

			local snapshot = commands:execute(
			"restore-proof-commit-snapshot",
			{ op = "snapshot", root = "game.Workspace." .. COMMIT_ROOT, includeScripts = true, checkpointId = "proof-commit-checkpoint" },
			false
		)
		expect(snapshot.ok == true and snapshot.data.restorable == true and snapshot.data.complete == true, "commit fixture snapshot is not exactly restorable")
		commitSnapshot = snapshot.data
		local checkpointScript = nil
		for _, child in snapshot.data.node.children do if child.className == "ModuleScript" then checkpointScript = child end end
		expect(checkpointScript ~= nil and checkpointScript.baseHash ~= nil and checkpointScript.sourceChars == #checkpointScript.source, "snapshot omitted source/hash metadata")

		recordPreparation("commit-live-state", function()
			local root = Workspace:FindFirstChild(COMMIT_ROOT) :: Folder
			expect(root ~= nil, "commit fixture disappeared before live-state preparation")
			local part = root:FindFirstChild("CheckpointPart") :: Part
			expect(part ~= nil, "checkpoint part disappeared before live-state preparation")
			part.Name = "LivePart"
			part.Transparency = 0.9
			part:SetAttribute("LiveMarker", "before-restore")
			root:SetAttribute("Version", "live")
			local scriptObject = root:FindFirstChild("Logic") :: ModuleScript
			expect(scriptObject ~= nil, "checkpoint script disappeared before live-state preparation")
			writeSource(scriptObject, "return \"live\"\n")
				newPart(root, "LiveExtra", 0.4):SetAttribute("LiveMarker", true)
			end)
			local liveExpected = captureCommitLiveState()

			local result, starts, finishes = captureRecording("restore-proof-commit", function()
			return commands:execute(
				"restore-proof-commit",
				{ op = "restore", root = "game.Workspace." .. COMMIT_ROOT, checkpointId = "proof-commit-checkpoint", snapshot = snapshot.data },
				true,
				stillCurrent
			)
			end)
			expectScalar(result.ok, true, "restore result ok")
			expectScalar(result.data and result.data.restored, true, "restore result restored")
			expectScalar(#starts, 1, "restore recording start count")
			expectScalar(#finishes, 1, "restore recording finish count")
		expectScalar(finishes[1] and finishes[1].committed, true, "restore recording committed")
			expectScalar(result.data.scriptsRestored, snapshot.data.scriptCount, "restore scriptsRestored")
			expectScalar(result.data.scriptsExpected, snapshot.data.scriptCount, "restore scriptsExpected")
			local restoredState = captureCommitCheckpointState()
			assertCommitCheckpointState(restoredState, checkpointExpected, "restoredCheckpoint")

			local canUndo, undoName = ChangeHistoryService:GetCanUndo()
			expectScalar(canUndo, true, "restore undo available")
			expectScalar(string.find(tostring(undoName), "Apple restore", 1, true) ~= nil, true, "restore undo name contains Apple restore")
			ChangeHistoryService:Undo()
			oneFrame()
			local undoObserved = captureCommitLiveState()
			assertCommitLiveState(undoObserved, liveExpected, "undoLive")
			local canRedo, redoName = ChangeHistoryService:GetCanRedo()
			expectScalar(canRedo, true, "restore redo available")
			ChangeHistoryService:Redo()
			oneFrame()
			local redoObserved = captureCommitCheckpointState()
			assertCommitCheckpointState(redoObserved, checkpointExpected, "redoCheckpoint")
			return {
				recordingStarts = #starts,
				recordingFinishes = #finishes,
				undoName = tostring(undoName),
				redoName = tostring(redoName),
				sourceHash = checkpointScript.baseHash,
				undoExpectedPartTransparency = liveExpected.partTransparency,
				undoObservedPartTransparency = undoObserved.partTransparency,
				undoExpectedExtraTransparency = liveExpected.extraTransparency,
				undoObservedExtraTransparency = undoObserved.extraTransparency,
			}
		end)

	measure(report, "tampered_source_hash_refuses_before_recording", function()
		expect(commitSnapshot ~= nil, "commit checkpoint snapshot is unavailable")
		local tampered = cloneTable(commitSnapshot)
		local scriptNode = nil
		for _, child in tampered.node.children do if child.className == "ModuleScript" then scriptNode = child end end
		expect(scriptNode ~= nil, "tamper target script is missing")
		scriptNode.source = "return \"tampered\"\n"
		local result, starts, finishes = captureRecording("restore-proof-hash-refusal", function()
			return commands:execute(
				"restore-proof-hash-refusal",
				{ op = "restore", root = "game.Workspace." .. COMMIT_ROOT, checkpointId = "proof-commit-checkpoint", snapshot = tampered },
				true,
				stillCurrent
			)
		end)
		expect(result.ok == false and result.failure == "invalid", "tampered source hash was not refused")
		expect(string.find(result.error or "", "hash", 1, true) ~= nil, "tampered source refusal did not identify hash integrity")
		expect(#starts == 0 and #finishes == 0, "tampered snapshot opened a ChangeHistory recording")
		return { refusedBeforeRecording = true }
	end)

	measure(report, "mid_restore_failure_cancels_and_rolls_back", function()
		recordPreparation("rollback-checkpoint-state", function()
			local root = Instance.new("Folder")
			root.Name = ROLLBACK_ROOT
			root:SetAttribute("Version", "checkpoint")
			root.Parent = Workspace
			newPart(root, "CheckpointPart", 0.2)
		end)
		local snapshot = commands:execute(
			"restore-proof-rollback-snapshot",
			{ op = "snapshot", root = "game.Workspace." .. ROLLBACK_ROOT, includeScripts = true, checkpointId = "proof-rollback-checkpoint" },
			false
		)
		expect(snapshot.ok == true and snapshot.data.restorable == true, "rollback fixture snapshot failed")
			recordPreparation("rollback-live-state", function()
			local root = Workspace:FindFirstChild(ROLLBACK_ROOT) :: Folder
			expect(root ~= nil, "rollback fixture disappeared before live-state preparation")
			root:SetAttribute("Version", "live")
			local livePart = root:FindFirstChild("CheckpointPart") :: Part
			expect(livePart ~= nil, "rollback checkpoint part disappeared before live-state preparation")
			livePart.Name = "LiveBeforeFailure"
			livePart.Transparency = 0.8
			livePart:SetAttribute("LiveMarker", "rollback")
			local guard = newPart(root, "RollbackGuard", 0.6)
				guard:SetAttribute("GuardMarker", 17)
			end)
			local rollbackExpected = captureRollbackLiveState()

		local malformed = cloneTable(snapshot.data)
		local checkpointPart = malformed.node.children[1]
		expect(checkpointPart ~= nil and checkpointPart.className == "Part", "rollback proof expected one Part snapshot child")
		checkpointPart.props.Text = { t = "string", v = "Part has no Text property" }
		local result, starts, finishes = captureRecording("restore-proof-rollback", function()
			return commands:execute(
				"restore-proof-rollback",
				{ op = "restore", root = "game.Workspace." .. ROLLBACK_ROOT, checkpointId = "proof-rollback-checkpoint", snapshot = malformed },
				true,
				stillCurrent
			)
		end)
			expectScalar(result.ok, false, "forced restore result ok")
			expectScalar(result.failure, "internal", "forced restore failure kind")
			expectScalar(#starts, 1, "cancel restore recording start count")
			expectScalar(#finishes, 1, "cancel restore recording finish count")
			expectScalar(finishes[1] and finishes[1].cancelled, true, "cancel restore recording cancelled")
			local rollbackObserved = captureRollbackLiveState()
			assertRollbackLiveState(rollbackObserved, rollbackExpected, "cancelLive")
			return {
				cancelled = true,
				rolledBack = true,
				recordingStarts = #starts,
				recordingFinishes = #finishes,
				cancelExpectedPartTransparency = rollbackExpected.partTransparency,
				cancelObservedPartTransparency = rollbackObserved.partTransparency,
				cancelExpectedGuardTransparency = rollbackExpected.guardTransparency,
				cancelObservedGuardTransparency = rollbackObserved.guardTransparency,
			}
		end)

	measure(report, "checkpoint_identity_and_consent_refuse_before_mutation", function()
		expect(commitSnapshot ~= nil, "commit checkpoint snapshot is unavailable")
		local root = Workspace:FindFirstChild(COMMIT_ROOT)
		expect(root ~= nil, "commit fixture is missing")
		local before = #root:GetChildren()
		local wrong = commands:execute(
			"restore-proof-wrong-id",
			{ op = "restore", root = "game.Workspace." .. COMMIT_ROOT, checkpointId = "wrong-checkpoint", snapshot = commitSnapshot },
			true,
			stillCurrent
		)
		expect(wrong.ok == false and wrong.failure == "conflict", "checkpoint identity mismatch was not refused")
		local noConsent = commands:execute(
			"restore-proof-no-consent",
			{ op = "restore", root = "game.Workspace." .. COMMIT_ROOT, checkpointId = "proof-commit-checkpoint", snapshot = commitSnapshot },
			false,
			stillCurrent
		)
		expect(noConsent.ok == false and noConsent.failure == "refused", "restore ran without explicit edit consent")
		expect(#root:GetChildren() == before, "identity/consent refusal mutated the fixture")
		return { identityBound = true, explicitConsentRequired = true }
	end)

	measure(report, "fixture_cleanup", function()
		commands:destroy()
		removeIfPresent(Workspace, COMMIT_ROOT)
		removeIfPresent(Workspace, ROLLBACK_ROOT)
		expect(Workspace:FindFirstChild(COMMIT_ROOT) == nil and Workspace:FindFirstChild(ROLLBACK_ROOT) == nil, "restore proof fixture survived cleanup")
		return { clean = true }
	end)

	print("APPLE_RESTORE_ENGINE_PROOF " .. HttpService:JSONEncode(report))
	return report
end

return Proof
