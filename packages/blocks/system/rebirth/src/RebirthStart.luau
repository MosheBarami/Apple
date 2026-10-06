-- Serves Rebirth.rebirth to clients as ReplicatedStorage.RebirthRequest. Written by StudPilot.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Rebirth = require(script.Parent:WaitForChild("Rebirth"))
local remote = ReplicatedStorage:FindFirstChild("RebirthRequest") or Instance.new("RemoteFunction")
remote.Name = "RebirthRequest"
remote.Parent = ReplicatedStorage
remote.OnServerInvoke = Rebirth.rebirth
