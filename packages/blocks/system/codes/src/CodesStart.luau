-- Serves Codes.redeem to clients as ReplicatedStorage.RedeemCode. Written by StudPilot.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Codes = require(script.Parent:WaitForChild("Codes"))
local remote = ReplicatedStorage:FindFirstChild("RedeemCode") or Instance.new("RemoteFunction")
remote.Name = "RedeemCode"
remote.Parent = ReplicatedStorage
remote.OnServerInvoke = Codes.redeem
