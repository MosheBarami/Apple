-- Serves ClickEarn.click to clients as the RemoteEvent ReplicatedStorage.ClickEarn. Written by StudPilot.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ClickEarn = require(script.Parent:WaitForChild("ClickEarn"))
local remote = ReplicatedStorage:FindFirstChild("ClickEarn") or Instance.new("RemoteEvent")
remote.Name = "ClickEarn"
remote.Parent = ReplicatedStorage
remote.OnServerEvent:Connect(ClickEarn.click)
