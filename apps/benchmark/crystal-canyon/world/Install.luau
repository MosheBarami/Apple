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
	{ "src/server/CodeTable.luau", "server", "CodeTable", "ModuleScript" },
	{ "src/server/Profile.luau", "server", "Profile", "ModuleScript" },
	{ "src/server/Objectives.luau", "server", "Objectives", "ModuleScript" },
	{ "src/server/Movement.luau", "server", "Movement", "ModuleScript" },
	{ "src/server/DataService.luau", "server", "DataService", "ModuleScript" },
	{ "src/server/Economy.luau", "server", "Economy", "ModuleScript" },
	{ "src/server/Upgrades.luau", "server", "Upgrades", "ModuleScript" },
	{ "src/server/Zones.luau", "server", "Zones", "ModuleScript" },
	{ "src/server/Collect.luau", "server", "Collect", "ModuleScript" },
	{ "src/server/Codes.luau", "server", "Codes", "ModuleScript" },
	{ "src/server/Net.luau", "server", "Net", "ModuleScript" },

	{ "src/client/init.client.luau", "clientRoot", "CrystalCanyonClient", "LocalScript" },
	{ "src/client/Theme.luau", "client", "Theme", "ModuleScript" },
	--[[ Icons was written, committed, and never added to this list. Hud waits
		 for it BOUNDED (5s) and degrades to "drawing without pictograms"; Panels
		 waits for it UNBOUNDED, so every panel in the game — shop, upgrades,
		 codes — has been silently dead in play since the module landed. The
		 manifest-coverage test added alongside this entry is what stops the
		 next module from going the same way. ]]
	{ "src/client/Icons.luau", "client", "Icons", "ModuleScript" },
	{ "src/client/Hud.luau", "client", "Hud", "ModuleScript" },
	{ "src/client/Panels.luau", "client", "Panels", "ModuleScript" },
	{ "src/client/Effects.luau", "client", "Effects", "ModuleScript" },
	{ "src/client/Objective.luau", "client", "Objective", "ModuleScript" },
	{ "src/client/Gates.luau", "client", "Gates", "ModuleScript" },
	--[[ The isolated UI evaluation harness (§N). It ships because the command
		 context runs in a SEPARATE Luau VM whose `require` returns a fresh module —
		 a harness left outside the manifest could only be run by pasting its
		 source, which drifts from the file the moment either is edited. Installed,
		 what runs IS what is committed. It is inert: nothing calls Stories.mount. ]]
	{ "src/client/Stories.luau", "client", "Stories", "ModuleScript" },
}

--[[ MEASURED TRAP, do not "optimise" this back to reuse-in-place.

	 `require()` caches per ModuleScript INSTANCE for the life of the DataModel,
	 and rewriting `.Source` does NOT invalidate that cache. Reinstalling over a
	 module that has already been required therefore leaves the OLD table live,
	 and the new source is silently ignored.

	 This bit during development: Palette gained two colour tokens, the installer
	 reported "installed 19/19", and the world build then failed with
	 `Color3 expected, got nil` — the freshly written token was missing from the
	 cached table. Destroying and recreating gives each module a new identity and
	 therefore a fresh require.

	 The cost is that every install is a full replace. That is the right trade:
	 a stale module is a silent wrong answer, and this is a build step. ]]
local function ensure(parent: Instance, name: string, className: string): Instance
	local existing = parent:FindFirstChild(name)
	if existing then
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
