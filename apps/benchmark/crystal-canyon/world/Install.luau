--!strict
--[[
	Crystal Canyon — installer.

	Run this in Studio's EDIT mode with the repo served over HTTP:

	    cd apps/benchmark/crystal-canyon && python3 -m http.server 8777 --bind 127.0.0.1

	Pulling the sources over HTTP rather than pasting them means an install is one
	call regardless of how many modules there are, and re-running after an edit is
	the same one call. Idempotent: existing instances are updated in place, so
	nothing in the place is orphaned or duplicated.

	This is the only supported way to get the game into a place. Hand-editing
	scripts in Studio would put the place and the repo out of sync, and the repo
	is the reviewable artifact.
]]

local BASE = "http://127.0.0.1:8777"

local Http = game:GetService("HttpService")
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")
local StarterPlayer = game:GetService("StarterPlayer")

Http.HttpEnabled = true

local MANIFEST = {
	-- { repo path, parent spec, instance name, class }
	{ "src/shared/Config.luau", "shared", "Config", "ModuleScript" },
	{ "src/shared/Remotes.luau", "shared", "Remotes", "ModuleScript" },
	{ "src/shared/Palette.luau", "shared", "Palette", "ModuleScript" },
	{ "src/shared/Util.luau", "shared", "Util", "ModuleScript" },

	{ "src/server/init.server.luau", "serverRoot", "CrystalCanyonServer", "Script" },
	{ "src/server/Profile.luau", "server", "Profile", "ModuleScript" },
	{ "src/server/DataService.luau", "server", "DataService", "ModuleScript" },
	{ "src/server/Economy.luau", "server", "Economy", "ModuleScript" },
	{ "src/server/Upgrades.luau", "server", "Upgrades", "ModuleScript" },
	{ "src/server/Zones.luau", "server", "Zones", "ModuleScript" },
	{ "src/server/Collect.luau", "server", "Collect", "ModuleScript" },
	{ "src/server/Codes.luau", "server", "Codes", "ModuleScript" },
	{ "src/server/Net.luau", "server", "Net", "ModuleScript" },

	{ "src/client/init.client.luau", "clientRoot", "CrystalCanyonClient", "LocalScript" },
	{ "src/client/Theme.luau", "client", "Theme", "ModuleScript" },
	{ "src/client/Hud.luau", "client", "Hud", "ModuleScript" },
	{ "src/client/Panels.luau", "client", "Panels", "ModuleScript" },
	{ "src/client/Effects.luau", "client", "Effects", "ModuleScript" },
	{ "src/client/Objective.luau", "client", "Objective", "ModuleScript" },
}

local function ensure(parent: Instance, name: string, className: string): Instance
	local existing = parent:FindFirstChild(name)
	if existing then
		if existing.ClassName == className then
			return existing
		end
		-- Class changed (e.g. Script -> LocalScript). Replacing is correct;
		-- keeping a wrong-class instance would fail silently at runtime.
		existing:Destroy()
	end
	local inst = Instance.new(className)
	inst.Name = name
	inst.Parent = parent
	return inst
end

-- Roots -------------------------------------------------------------------
local sharedRoot = ensure(RS, "CrystalCanyon", "Folder")
local serverRoot = ensure(SSS, "CrystalCanyonServer", "Script")
local sps = StarterPlayer:FindFirstChild("StarterPlayerScripts")
	or ensure(StarterPlayer, "StarterPlayerScripts", "StarterPlayerScripts")
local clientRoot = ensure(sps, "CrystalCanyonClient", "LocalScript")

local PARENTS: { [string]: Instance } = {
	shared = sharedRoot,
	server = serverRoot,
	client = clientRoot,
	serverRoot = SSS,
	clientRoot = sps,
}

-- Install -----------------------------------------------------------------
local installed, failed, bytes = 0, {}, 0

for _, row in MANIFEST do
	local path, parentKey, name, className = row[1], row[2], row[3], row[4]
	local ok, body = pcall(function()
		return Http:GetAsync(`{BASE}/{path}`)
	end)
	if not ok or type(body) ~= "string" or #body == 0 then
		table.insert(failed, `{path}: {tostring(body)}`)
		continue
	end

	local target: Instance
	if parentKey == "serverRoot" then
		target = serverRoot
	elseif parentKey == "clientRoot" then
		target = clientRoot
	else
		target = ensure(PARENTS[parentKey], name, className)
	end

	local okSet, setErr = pcall(function()
		(target :: any).Source = body
	end)
	if okSet then
		installed += 1
		bytes += #body
	else
		table.insert(failed, `{path}: could not set Source ({tostring(setErr)})`)
	end
end

local summary = `installed {installed}/{#MANIFEST} modules, {bytes} bytes`
if #failed > 0 then
	summary ..= `\nFAILED ({#failed}):\n  ` .. table.concat(failed, "\n  ")
end
print(summary)
return summary
