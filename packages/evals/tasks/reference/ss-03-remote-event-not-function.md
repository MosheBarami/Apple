```luau
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- A RemoteEvent, not a RemoteFunction. A remote call into a client has no timeout, so a client that
-- simply never returns would hang this server thread for everybody in the server.
local roundStarted = ReplicatedStorage:FindFirstChild("RoundStarted")
if roundStarted == nil then
	roundStarted = Instance.new("RemoteEvent")
	roundStarted.Name = "RoundStarted"
	roundStarted.Parent = ReplicatedStorage
end

Players.PlayerAdded:Connect(function(player)
	roundStarted:FireClient(player, "Lava Rush")
end)
```
