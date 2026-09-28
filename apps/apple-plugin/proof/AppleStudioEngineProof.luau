--!strict
-- Disposable LOCAL Studio proof. This module performs no HTTP, asset, publishing or provider work.
-- Run only from the one-line Command Bar expression printed by build-studio-engine-proof.mjs.
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local Commands = require(ServerScriptService:WaitForChild("AppleCommandsUnderProof"))

local Proof = {}
local FIXTURE_NAME = "AppleStudioEngineProofFixture"
local CANCEL_NAME = "AppleStudioEngineCancelProof"
local MARKER_NAME = "AppleStudioEngineProofMarker"

local function expect(condition: any, message: string)
	if not condition then error(message, 2) end
end

local function removeIfPresent(parent: Instance, name: string)
	local found = parent:FindFirstChild(name)
	if found then found:Destroy() end
end

local function oneFrame()
	-- ChangeHistory notifications normally settle synchronously. One scheduler turn makes the
	-- observation robust without hiding a stuck operation behind a long wait.
	task.wait()
end

local function isRecording(): boolean?
	if type((ChangeHistoryService :: any).IsRecordingInProgress) ~= "function" then return nil end
	local ok, value = pcall(function() return (ChangeHistoryService :: any):IsRecordingInProgress() end)
	if not ok then return nil end
	return value == true
end

local function measure(report: any, name: string, callback: () -> any)
	local started = os.clock()
	local ok, value = pcall(callback)
	local row: any = {
		name = name,
		ok = ok,
		durationMs = math.max(0, math.floor((os.clock() - started) * 1000)),
	}
	if ok then
		row.observed = value
	else
		row.error = tostring(value)
		report.ok = false
	end
	table.insert(report.checks, row)
end

function Proof.run(): any
	expect(RunService:IsStudio(), "This proof may run only in Roblox Studio")
	expect(RunService:IsEdit(), "Stop the playtest and run this proof in Studio edit mode")
	expect(game.PlaceId == 0, "Refusing to mutate a published place; open the disposable proof .rbxl")
	local marker = Workspace:FindFirstChild(MARKER_NAME)
	expect(marker ~= nil and marker:GetAttribute("AppleStudioEngineProof") == true, "Disposable proof marker is missing")

	removeIfPresent(Workspace, FIXTURE_NAME)
	removeIfPresent(Workspace, CANCEL_NAME)

	local report: any = {
		schema = 1,
		ok = true,
		engineObserved = true,
			placeId = game.PlaceId,
			checks = {},
			limitations = {
				"restore has a dedicated disposable proof; this general proof does not perform a checkpoint restore",
				"generate_model remains unavailable because GenerationService and the quality gate are not exercised here",
				"the widget's real click flow and network disconnect still require the main-owned native UI pass",
			},
	}

	measure(report, "cancel_recording_rolls_back", function()
		local recording = ChangeHistoryService:TryBeginRecording("Apple engine proof cancel", "Apple engine proof cancel")
		expect(recording ~= nil, "ChangeHistoryService refused the cancellation recording")
		local part = Instance.new("Part")
		part.Name = CANCEL_NAME
		part.Anchored = true
		part.Parent = Workspace
		expect(Workspace:FindFirstChild(CANCEL_NAME) == part, "cancellation fixture was not created")
		ChangeHistoryService:FinishRecording(recording :: string, Enum.FinishRecordingOperation.Cancel)
		oneFrame()
		expect(Workspace:FindFirstChild(CANCEL_NAME) == nil, "FinishRecording(Cancel) did not roll back the in-progress part")
		return { rolledBack = true, recordingStillOpen = isRecording() }
	end)

	local commands = Commands.new()
	measure(report, "edit_consent_then_disconnect_gate", function()
		local connected = true
		local allowEdits = false
		local createOp = {
			op = "create_instances",
			items = {{
				className = "Folder",
				name = FIXTURE_NAME,
				parent = "game.Workspace",
				children = {{ className = "Part", name = "ProofPart" }},
			}},
		}
		local denied = commands:execute("proof-consent-denied", createOp, allowEdits and connected)
		expect(denied.ok == false and denied.failure == "refused", "a write ran before explicit consent")
		expect(Workspace:FindFirstChild(FIXTURE_NAME) == nil, "the denied write changed the place")

		allowEdits = true
		local created = commands:execute("proof-consent-allowed", createOp, allowEdits and connected)
		expect(created.ok == true, "the consented write failed: " .. tostring(created.error))
		expect(Workspace:FindFirstChild(FIXTURE_NAME) ~= nil, "the consented write did not create its fixture")

		connected = false
		allowEdits = false
		local afterDisconnect = commands:execute(
			"proof-after-disconnect",
			{ op = "delete_instances", paths = { "game.Workspace." .. FIXTURE_NAME } },
			allowEdits and connected
		)
		expect(afterDisconnect.ok == false and afterDisconnect.failure == "refused", "a write ran after disconnect")
		expect(Workspace:FindFirstChild(FIXTURE_NAME) ~= nil, "disconnect-gated delete changed the place")
		return { deniedBeforeConsent = true, allowedAfterConsent = true, deniedAfterDisconnect = true }
	end)

	measure(report, "command_recording_undo_redo", function()
		expect(Workspace:FindFirstChild(FIXTURE_NAME) ~= nil, "the committed command fixture is missing")
		local canUndo, undoName = ChangeHistoryService:GetCanUndo()
		expect(canUndo == true, "Studio reported no undo after the committed Apple command")
		ChangeHistoryService:Undo()
		oneFrame()
		expect(Workspace:FindFirstChild(FIXTURE_NAME) == nil, "Undo did not remove the committed Apple command")
		local canRedo, redoName = ChangeHistoryService:GetCanRedo()
		expect(canRedo == true, "Studio reported no redo after Undo")
		ChangeHistoryService:Redo()
		oneFrame()
		expect(Workspace:FindFirstChild(FIXTURE_NAME) ~= nil, "Redo did not recreate the Apple command")
		return { undoName = tostring(undoName), redoName = tostring(redoName), recreated = true }
	end)

	measure(report, "model_transform_pivots_rotation_scale_undo_redo", function()
		local fixture = Workspace:FindFirstChild(FIXTURE_NAME)
		expect(fixture ~= nil, "transform fixture parent is missing")
		local setup = ChangeHistoryService:TryBeginRecording("Pivot fixture", "Pivot fixture")
		expect(setup ~= nil, "could not record pivot fixture")
		local model = Instance.new("Model"); model.Name = "PivotAssembly"; model.Parent = fixture
		local nested = Instance.new("Model"); nested.Name = "Nested"; nested.Parent = model
		local part = Instance.new("Part"); part.Anchored = true; part.Size = Vector3.new(2, 4, 6)
		part.CFrame = CFrame.new(10, 20, 30) * CFrame.Angles(0.2, 0.4, 0.6); part.Parent = nested
		model.WorldPivot = CFrame.new(12, 23, 34) * CFrame.Angles(0.1, 0.3, 0.5)
		nested.WorldPivot = CFrame.new(9, 18, 27) * CFrame.Angles(0.4, 0.2, 0.1)
		local primaryModel = Instance.new("Model"); primaryModel.Name = "Primary"; primaryModel.Parent = model
		local primary = part:Clone(); primary.Parent = primaryModel; primaryModel.PrimaryPart = primary
		primary.PivotOffset = CFrame.new(0.25, 0.5, 0.75)
		local sibling = Instance.new("Model"); sibling.Name = "Unselected"; sibling.Parent = fixture
		sibling.WorldPivot = CFrame.new(80, 80, 80)
		ChangeHistoryService:FinishRecording(setup :: string, Enum.FinishRecordingOperation.Commit)
		local origin = model:GetBoundingBox().Position
		local oldPart, oldRoot, oldNested, oldPrimary = part.CFrame, model:GetPivot(), nested:GetPivot(), primaryModel:GetPivot()
		local oldSize = part.Size
		local rotation = CFrame.Angles(math.rad(20), math.rad(40), math.rad(60))
		local move = Vector3.new(2, 3, 4)
		local function transformed(frame: CFrame): CFrame
			local position = origin + rotation:VectorToWorldSpace(frame.Position - origin) * 2 + move
			return CFrame.new(position) * rotation * frame.Rotation
		end
		local function closeFrame(actual: CFrame, expected: CFrame, label: string)
			local a, b = { actual:GetComponents() }, { expected:GetComponents() }
			for index = 1, 12 do expect(math.abs(a[index] - b[index]) < 0.001, label .. " component " .. tostring(index)) end
		end
		local result = commands:execute("proof-transform-pivots", {
			op = "transform_instances", paths = { "game.Workspace." .. FIXTURE_NAME .. ".PivotAssembly" },
			move = { 2, 3, 4 }, rotate = { 20, 40, 60 }, scale = 2,
		}, true)
		expect(result.ok == true, tostring(result.error))
		expect(result.data.parts == 2 and result.data.pivots == 2, "incorrect part or pivot count")
		closeFrame(part.CFrame, transformed(oldPart), "part transform")
		closeFrame(model:GetPivot(), transformed(oldRoot), "root pivot")
		closeFrame(nested:GetPivot(), transformed(oldNested), "nested pivot")
		-- PrimaryPart PivotOffset remains unchanged by the existing size transform.
		closeFrame(primaryModel:GetPivot(), transformed(oldPart) * primary.PivotOffset, "PrimaryPart pivot")
		expect((part.Size - oldSize * 2).Magnitude < 0.001, "part size did not scale")
		closeFrame(sibling:GetPivot(), CFrame.new(80, 80, 80), "unselected sibling")
		ChangeHistoryService:Undo(); oneFrame()
		closeFrame(part.CFrame, oldPart, "undo part"); closeFrame(model:GetPivot(), oldRoot, "undo root pivot")
		closeFrame(nested:GetPivot(), oldNested, "undo nested pivot"); closeFrame(primaryModel:GetPivot(), oldPrimary, "undo primary pivot")
		ChangeHistoryService:Redo(); oneFrame()
		closeFrame(part.CFrame, transformed(oldPart), "redo part"); closeFrame(model:GetPivot(), transformed(oldRoot), "redo root pivot")
		closeFrame(nested:GetPivot(), transformed(oldNested), "redo nested pivot")
		return { parts = result.data.parts, pivots = result.data.pivots, rotationDegrees = { 20, 40, 60 }, scale = 2, undoRedo = true, unselectedUnchanged = true }
	end)

	measure(report, "source_hash_conflict_preserves_studio_edit", function()
		local target = ServerScriptService:FindFirstChild("AppleSourceHashTarget")
		expect(target ~= nil and target:IsA("ModuleScript"), "source-hash target ModuleScript is missing")
		local original = ScriptEditorService:GetEditorSource(target :: any)
		local read = commands:execute(
			"proof-source-read",
			{ op = "read_script", path = "game.ServerScriptService.AppleSourceHashTarget" },
			false
		)
		expect(read.ok == true and type(read.data.baseHash) == "string", "Apple could not read a source hash")

		local studioText = "return \"studio-edited-after-read\"\n"
		ScriptEditorService:UpdateSourceAsync(target :: any, function(_: string): string return studioText end)
		local stale = commands:execute(
			"proof-source-stale",
			{
				op = "edit_script",
				path = "game.ServerScriptService.AppleSourceHashTarget",
				baseHash = read.data.baseHash,
				source = "return \"stale-agent-write\"\n",
			},
			true
		)
		local after = ScriptEditorService:GetEditorSource(target :: any)
		expect(stale.ok == false and stale.failure == "conflict", "a stale source write was not reported as a conflict")
		expect(after == studioText, "the stale write overwrote the Studio-side source")
		ScriptEditorService:UpdateSourceAsync(target :: any, function(_: string): string return original end)
		return { conflict = true, studioSourcePreserved = true, recordingStillOpen = isRecording() }
	end)

	local snapshot: any = nil
		measure(report, "snapshot_root_game", function()
			local result = commands:execute(
				"proof-snapshot-game",
				{ op = "snapshot", root = "game", includeScripts = true, checkpointId = "proof-general-place" },
				false
			)
			expect(result.ok == true, "root=game snapshot failed: " .. tostring(result.error))
			expect(result.data.root == "game", "snapshot returned the wrong root")
			expect(result.data.node.className == "DataModel", "snapshot did not use the synthetic DataModel root")
			expect(result.data.checkpointId == "proof-general-place", "snapshot did not bind checkpoint identity")
			expect(type(result.data.instanceCount) == "number", "snapshot omitted instanceCount")
			expect(type(result.data.scriptCount) == "number", "snapshot omitted scriptCount")
			snapshot = result.data
			return {
			complete = result.data.complete,
			truncated = result.data.truncated,
			instanceCount = result.data.instanceCount,
			scriptCount = result.data.scriptCount,
			skipped = result.data.skipped,
			}
		end)

		measure(report, "restore_is_delegated_to_dedicated_engine_proof", function()
			expect(snapshot ~= nil, "snapshot evidence is unavailable")
			expect(snapshot.complete == false and snapshot.wholePlaceComplete == false, "general proof snapshot overstated whole-place completeness")
			return { dedicatedProof = "AppleRestoreEngineProof", coverage = snapshot.coverage, restorable = snapshot.restorable }
		end)

	measure(report, "generation_stays_unavailable_without_qc", function()
		local before = #Workspace:GetChildren()
		local result = commands:execute(
			"proof-generation-refusal",
			{ op = "generate_model", prompt = "genre-specific proof model", parent = "game.Workspace" },
			true
		)
		expect(result.ok == false and result.failure == "refused", "generate_model reported success without the verified adapter and QC gate")
		expect(string.find(result.error or "", "no substitute", 1, true) ~= nil, "generation refusal did not state that no substitute was created")
		expect(#Workspace:GetChildren() == before, "generation refusal created an object")
		return { refused = true, noSubstitute = true }
	end)

	measure(report, "command_teardown", function()
		commands:destroy()
		local result = commands:execute("proof-after-destroy", { op = "ping" }, false)
		expect(result.ok == false and result.failure == "refused", "destroyed command engine accepted work")
		expect(isRecording() ~= true, "teardown left a ChangeHistory recording open")
		return { destroyed = true, furtherCommandsRefused = true }
	end)

	measure(report, "fixture_cleanup", function()
		removeIfPresent(Workspace, FIXTURE_NAME)
		removeIfPresent(Workspace, CANCEL_NAME)
		expect(Workspace:FindFirstChild(FIXTURE_NAME) == nil, "proof fixture survived cleanup")
		expect(Workspace:FindFirstChild(CANCEL_NAME) == nil, "cancellation fixture survived cleanup")
		return { clean = true }
	end)

	print("APPLE_STUDIO_ENGINE_PROOF " .. HttpService:JSONEncode(report))
	return report
end

return Proof
