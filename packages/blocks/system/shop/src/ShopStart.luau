-- Answers ReplicatedStorage.ShopBuy with the Shop module's rules. Written by StudPilot's shop block.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Shop = require(script.Parent:WaitForChild("Shop"))
local remote = ReplicatedStorage:FindFirstChild("ShopBuy") or Instance.new("RemoteFunction")
remote.Name = "ShopBuy"
remote.Parent = ReplicatedStorage
remote.OnServerInvoke = Shop.buy
