-- Serves Upgrades.buy to clients as ReplicatedStorage.UpgradeBuy. Written by StudPilot.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Upgrades = require(script.Parent:WaitForChild("Upgrades"))
local remote = ReplicatedStorage:FindFirstChild("UpgradeBuy") or Instance.new("RemoteFunction")
remote.Name = "UpgradeBuy"
remote.Parent = ReplicatedStorage
remote.OnServerInvoke = Upgrades.buy
