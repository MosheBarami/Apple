```luau
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local setNickname = ReplicatedStorage:WaitForChild("SetNickname", 10)

setNickname.OnServerEvent:Connect(function(player, requested)
	-- Nothing about the argument is known until it is checked: a client can send a table, an
	-- Instance, nil, or a megabyte of text just as easily as the string the UI would have sent.
	if typeof(requested) ~= "string" then
		return
	end
	if #requested == 0 or #requested > 20 then
		return
	end
	player:SetAttribute("Nickname", requested)
end)
```
