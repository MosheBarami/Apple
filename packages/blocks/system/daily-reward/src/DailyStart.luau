-- Serves Daily.claim to clients as ReplicatedStorage.DailyClaim. Written by StudPilot.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Daily = require(script.Parent:WaitForChild("Daily"))
local remote = ReplicatedStorage:FindFirstChild("DailyClaim") or Instance.new("RemoteFunction")
remote.Name = "DailyClaim"
remote.Parent = ReplicatedStorage
remote.OnServerInvoke = Daily.claim
