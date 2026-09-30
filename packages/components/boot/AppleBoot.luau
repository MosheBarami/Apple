--!strict
-- Starts a composed game's systems. AppleGameConfig (written by the composer) lists them in `start`, in order;
-- each module gets the whole config and the economy. A system that fails to start is named in Output and the
-- others still start.
local folder = game:GetService("ServerScriptService"):WaitForChild("AppleComponents")
local config = require(folder:WaitForChild("AppleGameConfig")) :: any
local economy = if folder:FindFirstChild("AppleEconomy") then require(folder.AppleEconomy) :: any else nil
for _, name in config.start or {} do
	local module = folder:FindFirstChild(name)
	if not module then
		warn("AppleBoot: " .. name .. " is not installed")
		continue
	end
	local ok, err = pcall(function() (require(module) :: any).start(config, economy) end)
	if not ok then warn("AppleBoot: " .. name .. " did not start: " .. tostring(err)) end
end
