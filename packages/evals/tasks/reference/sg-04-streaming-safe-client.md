```luau
local Players = game:GetService("Players")
local player = Players.LocalPlayer

local STREAM_TIMEOUT = 20

-- With StreamingEnabled the client's Workspace holds only what has streamed in, so a direct dot
-- index into the lobby model is a coin flip decided by where the player happens to be standing.
-- Every step is waited for WITH a timeout, and a miss is a quiet return rather than a hung thread.
local lobby = workspace:WaitForChild("Lobby", STREAM_TIMEOUT)
local portal = lobby and lobby:WaitForChild("Portal", STREAM_TIMEOUT)
local detector = portal and portal:WaitForChild("ClickDetector", STREAM_TIMEOUT)

if detector == nil then
	warn("portal never streamed in for this client")
	return
end

detector.MouseClick:Connect(function(clicker: Player)
	if clicker ~= player then
		return
	end
	print("portal clicked")
end)
```
