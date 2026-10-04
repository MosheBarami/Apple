--!nocheck
-- Disposable LOCAL Studio proof for the real GenerationService path.
--
-- This module performs one generation request only after the owner explicitly runs the Command
-- Bar expression printed by build-generation-engine-proof.mjs. It refuses published/unmarked
-- places, performs no HTTP, asset insertion, upload or publication, and leaves the redone model in
-- the dedicated proof folder for visual inspection. Building the place does not execute this file.

local ChangeHistoryService = game:GetService("ChangeHistoryService")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local ServerScriptService = game:GetService("ServerScriptService")
local Workspace = game:GetService("Workspace")

local Commands = require(ServerScriptService:WaitForChild("AppleCommandsUnderGenerationProof"))
local GenerationAdapter = require(ServerScriptService:WaitForChild("AppleGenerationServiceAdapter"))

local Proof = {}
local MARKER_NAME = "AppleGenerationEngineProofMarker"
local DESTINATION_NAME = "AppleGenerationProofDestination"
local OPERATION_ID = "proof-generation-once"
local PROMPT = "a small low-poly wooden shipping crate with simple bevels, clean proportions, and no text"
local ran = false

local function expect(condition: any, message: string)
	if not condition then error(message, 2) end
end

local function oneFrame()
	task.wait()
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

local function proofName(): string
	return "Apple generate_model " .. OPERATION_ID
end

function Proof.run(): any
	expect(RunService:IsStudio(), "This proof may run only in Roblox Studio")
	expect(RunService:IsEdit(), "Stop the playtest and run this proof in Studio edit mode")
	expect(game.PlaceId == 0, "Refusing to generate in a published place; open the disposable proof .rbxl")
	expect(not ran, "This loaded proof module already made its one permitted generation request")

	local marker = Workspace:FindFirstChild(MARKER_NAME)
	expect(marker ~= nil and marker:GetAttribute("AppleGenerationEngineProof") == true, "Disposable generation proof marker is missing")
	local destination = Workspace:FindFirstChild(DESTINATION_NAME)
	expect(destination ~= nil and destination:IsA("Folder"), "Disposable generation destination is missing")
	expect(destination:GetAttribute("AppleGenerationProofDestination") == true, "Generation destination marker is missing")
	expect(#destination:GetChildren() == 0, "Generation proof destination is not empty; reopen a fresh proof .rbxl")
	ran = true

	local report: any = {
		schema = 1,
		ok = true,
		engineObserved = true,
		providerCallRequested = false,
		placeId = game.PlaceId,
		prompt = PROMPT,
		checks = {},
		limitations = {
			"structural QC cannot establish genre-specific visual quality; inspect the redone model in Studio",
			"timeout, disconnect and late-result cleanup are deterministic mock proofs here and are not forced against the live provider",
			"this proof performs no upload, publication or persistent asset creation",
		},
	}

	local adapter = GenerationAdapter.new()
	measure(report, "generation_capability_probe", function()
		local capability = adapter:probe()
		expect(capability.available == true, "GenerationService.GenerateModelAsync is unavailable in this Studio build")
		expect(capability.capability == "DynamicGeneration", "GenerationService did not report the expected capability contract")
		return capability
	end)

	local commands = Commands.new({ generation = adapter })
	local connected = true
	local allowEdits = true
	local function stillCurrent(): boolean
		return connected and allowEdits and RunService:IsEdit()
	end

	local generatedResult: any = nil
	local generatedName: string? = nil
	measure(report, "one_generation_detached_qc_single_recording", function()
		local starts = {}
		local finishes = {}
		local startConnection = ChangeHistoryService.OnRecordingStarted:Connect(function(name: string, displayName: string?)
			if name == proofName() then table.insert(starts, { name = name, displayName = displayName }) end
		end)
		local finishConnection = ChangeHistoryService.OnRecordingFinished:Connect(function(
			name: string,
			displayName: string?,
			identifier: string?,
			operation: any
		)
			if name == proofName() then
				table.insert(finishes, {
					name = name,
					displayName = displayName,
					identifier = identifier,
					operation = tostring(operation),
					committed = operation == Enum.FinishRecordingOperation.Commit,
				})
			end
		end)

		report.providerCallRequested = true
		local executed, result = pcall(function()
			return commands:execute(
				OPERATION_ID,
				{
					op = "generate_model",
					prompt = PROMPT,
					intent = "low-poly proof crate",
					maxTriangles = 1500,
					predefinedSchema = "Body1",
					parent = "game.Workspace." .. DESTINATION_NAME,
				},
				allowEdits and connected,
				stillCurrent
			)
		end)
		startConnection:Disconnect()
		finishConnection:Disconnect()
		expect(executed, "generation command raised: " .. tostring(result))
		generatedResult = result
		expect(result.ok == true, "generation command failed: " .. tostring(result.error))
		expect(result.data.sessionScoped == true, "generation result was not marked session-scoped")
		expect(type(result.data.qc) == "table" and result.data.qc.verdict == "pass", "generation omitted a passing structural QC verdict")
		expect(result.data.qc.detached == true, "structural QC did not observe the Model while detached")
		expect(result.data.qc.visualJudgementRequired == true, "generation falsely claimed that structural checks prove visual quality")
		expect(type(result.data.qc.parts) == "number" and result.data.qc.parts > 0, "structural QC returned no parts")
		expect(type(result.data.qc.boundsStuds) == "table" and #result.data.qc.boundsStuds == 3, "structural QC omitted finite bounds")
		expect(#starts == 1, "generation did not start exactly one ChangeHistory recording")
		expect(#finishes == 1 and finishes[1].committed == true, "generation did not commit exactly one ChangeHistory recording")
		expect(#destination:GetChildren() == 1, "generation did not place exactly one Model")
		local model = destination:GetChildren()[1]
		expect(model:IsA("Model"), "placed generation is not a Model")
		generatedName = model.Name
		return {
			path = result.data.path,
			generationId = result.data.generationId,
			sessionScoped = result.data.sessionScoped,
			qc = result.data.qc,
			recordingStarts = #starts,
			recordingFinishes = #finishes,
			recording = finishes[1],
		}
	end)

	measure(report, "generation_recording_undo_redo", function()
		expect(generatedResult ~= nil and generatedResult.ok == true, "successful generation evidence is unavailable")
		expect(generatedName ~= nil, "generated Model name is unavailable")
		local canUndo, undoName = ChangeHistoryService:GetCanUndo()
		expect(canUndo == true, "Studio reported no undo after generation placement")
		expect(string.find(tostring(undoName), "Apple generate_model", 1, true) ~= nil, "generation is not the top undo action")
		ChangeHistoryService:Undo()
		oneFrame()
		expect(#destination:GetChildren() == 0, "Undo did not remove the generated Model")
		local canRedo, redoName = ChangeHistoryService:GetCanRedo()
		expect(canRedo == true, "Studio reported no redo after generation Undo")
		ChangeHistoryService:Redo()
		oneFrame()
		local redone = destination:FindFirstChild(generatedName :: string)
		expect(redone ~= nil and redone:IsA("Model"), "Redo did not restore the generated Model")
		return {
			undoName = tostring(undoName),
			redoName = tostring(redoName),
			removedByUndo = true,
			restoredByRedo = true,
			redoneModel = redone.Name,
		}
	end)

	measure(report, "visual_review_handoff", function()
		expect(generatedName ~= nil, "generated Model name is unavailable")
		local model = destination:FindFirstChild(generatedName :: string)
		expect(model ~= nil and model:IsA("Model"), "redone generated Model is missing")
		local parts = 0
		local meshParts = 0
		for _, descendant in model:GetDescendants() do
			if descendant:IsA("BasePart") then parts += 1 end
			if descendant:IsA("MeshPart") then meshParts += 1 end
		end
		return {
			model = model.Name,
			destination = "game.Workspace." .. DESTINATION_NAME,
			parts = parts,
			meshParts = meshParts,
			instruction = "Inspect silhouette, proportions, topology artifacts, texture coherence, Roblox scale, and low-poly genre fit before accepting the live gate.",
		}
	end)

	measure(report, "generation_command_teardown", function()
		connected = false
		allowEdits = false
		commands:destroy()
		local dead = commands:execute("proof-after-generation-destroy", { op = "ping" }, false)
		expect(dead.ok == false and dead.failure == "refused", "destroyed command engine accepted work")
		return { destroyed = true, furtherCommandsRefused = true }
	end)

	print("APPLE_GENERATION_ENGINE_PROOF " .. HttpService:JSONEncode(report))
	return report
end

return Proof
