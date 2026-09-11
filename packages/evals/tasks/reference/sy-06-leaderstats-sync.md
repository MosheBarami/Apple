```luau
local Players = game:GetService("Players")

local TRACKED = { "Coins", "Rebirths" }

Players.PlayerAdded:Connect(function(player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"

	for _, name in TRACKED do
		local stat = Instance.new("IntValue")
		stat.Name = name
		stat.Value = player:GetAttribute(name) or 0
		stat.Parent = leaderstats

		-- Attribute-driven rather than polled: the server writes the attribute in exactly one
		-- place and the replicated IntValue follows it, so the two cannot drift apart.
		player:GetAttributeChangedSignal(name):Connect(function()
			stat.Value = player:GetAttribute(name) or 0
		end)
	end

	leaderstats.Parent = player
end)
```
