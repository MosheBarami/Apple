-- One owner-authorized generation in the unpublished, marked proof place.
-- The shipped proof refuses a second run and owns structural checks and Undo/Redo.
local runner = game:GetService("ServerScriptService"):FindFirstChild("AppleGenerationEngineProof")
assert(runner and runner:IsA("ModuleScript"), "Open the isolated generation proof place")
local report = require(runner).run()
if report.ok then
    local destination = workspace:FindFirstChild("AppleGenerationProofDestination")
    local model = destination and destination:FindFirstChildWhichIsA("Model")
    if model then
        local frame, size = model:GetBoundingBox()
        local distance = math.max(size.X, size.Y, size.Z, 4) * 2
        local camera = workspace.CurrentCamera
        camera.CameraType = Enum.CameraType.Scriptable
        camera.CFrame = CFrame.lookAt(frame.Position + Vector3.new(distance, distance * 0.65, distance), frame.Position)
        game:GetService("Selection"):Set({ model })
    end
end
print("APPLE_GENERATION_ENGINE_TASK_COMPLETE " .. tostring(report.ok))
