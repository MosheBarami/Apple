--!strict
--[[
	Crystal Canyon — server boot.

	This Script owns three things and nothing else: it builds the network
	surface, it constructs the service context, and it starts the services in
	dependency order. All game logic lives in the sibling modules.

	It is written to fail visibly. A ModuleScript that is missing, fails to
	compile, or throws inside `init` is reported by name and the remaining
	services still start, because a half-booted server that says which half is
	broken is diagnosable and a silently dead one is not. What it will not do is
	pretend a broken service works: if the profile store or the economy failed
	to start, player wiring is skipped entirely rather than granting anything
	against state that does not exist.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local LOG = "[CrystalCanyon]"

-- How long a joining player may spend waiting for DataService to publish their
-- profile before we give up on wiring them. DataService does its own retrying
-- and its own kick-on-session-lock; this is only the boot script declining to
-- wait forever on a thread that would otherwise never end.
local PROFILE_WAIT_SECONDS = 30
local PROFILE_POLL_SECONDS = 0.1

-- Shared modules ----------------------------------------------------------

local sharedRoot = ReplicatedStorage:WaitForChild("CrystalCanyon", 30)
if not sharedRoot then
	error(`{LOG} ReplicatedStorage.CrystalCanyon never appeared — shared modules are not installed`)
end

local Config = require(sharedRoot:WaitForChild("Config")) :: any
local Util = require(sharedRoot:WaitForChild("Util")) :: any
local Remotes = require(sharedRoot:WaitForChild("Remotes")) :: any

-- Server modules ----------------------------------------------------------

--[[ Require a sibling ModuleScript, naming it loudly if it is missing or if it
	 errors at require time. Returns nil rather than propagating, so one bad
	 module does not stop the others from being requested. ]]
local function requireSibling(name: string): any
	local child = script:FindFirstChild(name)
	if not child or not child:IsA("ModuleScript") then
		warn(`{LOG} module "{name}" is missing from the server script`)
		return nil
	end
	local ok, result = pcall(require, child)
	if not ok then
		warn(`{LOG} module "{name}" failed to load: {tostring(result)}`)
		return nil
	end
	return result
end

local DataService = requireSibling("DataService")
local Economy = requireSibling("Economy")
local Upgrades = requireSibling("Upgrades")
local Zones = requireSibling("Zones")
local Collect = requireSibling("Collect")
local Codes = requireSibling("Codes")
local Shop = requireSibling("Shop")
local Net = requireSibling("Net")

-- Context -----------------------------------------------------------------

-- Built before any init runs, so a service that stores `ctx` during init can
-- reach every sibling afterwards even though those siblings have not started
-- yet. Services must therefore only *call* each other after their own init.
local ctx = {
	Config = Config,
	Util = Util,
	Remotes = Remotes.build(),

	Data = DataService,
	Economy = Economy,
	Upgrades = Upgrades,
	Zones = Zones,
	Collect = Collect,
	Codes = Codes,
	Shop = Shop,
}

-- Startup -----------------------------------------------------------------

--[[ Dependency order, and the reason for it:
	   Data      owns profiles; nothing can read state before it exists
	   Economy   mutates profiles; needs Data
	   Upgrades  spends coins; needs Economy
	   Zones     spends coins and gates the world; needs Economy
	   Collect   grants shards into zones the player has unlocked; needs both
	   Codes     grants coins; needs Economy
	   Net       exposes all of the above to clients; must be last so the trust
	             boundary never opens onto a service that has not started ]]
local BOOT: { { name: string, module: any } } = {
	{ name = "DataService", module = DataService },
	{ name = "Economy", module = Economy },
	{ name = "Upgrades", module = Upgrades },
	{ name = "Zones", module = Zones },
	{ name = "Collect", module = Collect },
	{ name = "Codes", module = Codes },
	-- Shop spends coins, so it needs Economy; Net stays last so the trust boundary never opens
	-- onto a service that has not started.
	{ name = "Shop", module = Shop },
	{ name = "Net", module = Net },
}

local failed: { [string]: boolean } = {}

for _, entry in BOOT do
	local module = entry.module
	if type(module) ~= "table" or type(module.init) ~= "function" then
		warn(`{LOG} service "{entry.name}" did not load or exposes no init(ctx) — skipped`)
		failed[entry.name] = true
		continue
	end
	local ok, err = pcall(module.init, ctx)
	if not ok then
		warn(`{LOG} service "{entry.name}" failed to init: {tostring(err)}`)
		failed[entry.name] = true
	end
end

-- Player lifecycle --------------------------------------------------------

local function applyCharacter(player: Player)
	--[[ Two independent applications, each gated on its OWN service's boot result and each in
		 its own pcall. A trail that fails to build must not cost the player their walk speed,
		 and a stats failure must not cost them the cosmetic they paid for. ]]
	if not failed.Upgrades then
		local ok, err = pcall(Upgrades.applyCharacter, player)
		if not ok then
			warn(`{LOG} Upgrades.applyCharacter failed for {player.Name}: {tostring(err)}`)
		end
	end
	if not failed.Shop then
		local ok, err = pcall(Shop.applyCharacter, player)
		if not ok then
			warn(`{LOG} Shop.applyCharacter failed for {player.Name}: {tostring(err)}`)
		end
	end
end

--[[ DataService owns loading — it is the only code that touches the DataStore,
	 and it kicks on a live session lock. This waits for the profile it
	 publishes rather than racing it, and pushes nothing if the profile never
	 arrives. A player with no profile is a player who gets no state, which is
	 the same rule Economy and Codes enforce on the granting side. ]]
local function onPlayerAdded(player: Player)
	local deadline = os.clock() + PROFILE_WAIT_SECONDS
	while not DataService.isReady(player) do
		if not player:IsDescendantOf(Players) then
			return -- left during load; nothing to wire
		end
		if os.clock() > deadline then
			warn(`{LOG} profile for {player.Name} never became ready — not wiring player`)
			return
		end
		task.wait(PROFILE_POLL_SECONDS)
	end
	if not player:IsDescendantOf(Players) then
		return
	end

	-- First authoritative snapshot. The client renders only what Sync sends, so
	-- until this fires the HUD has nothing legitimate to show.
	local ok, err = pcall(Economy.push, player)
	if not ok then
		warn(`{LOG} initial Sync failed for {player.Name}: {tostring(err)}`)
	end

	player.CharacterAdded:Connect(function()
		applyCharacter(player)
	end)

	-- The character can spawn while the profile is still loading, in which case
	-- the connection above missed it. Apply to whatever is already there.
	if player.Character then
		applyCharacter(player)
	end
end

if failed.DataService or failed.Economy then
	warn(`{LOG} core services did not start — player wiring is disabled to avoid granting against broken state`)
else
	local function handle(player: Player)
		local ok, err = pcall(onPlayerAdded, player)
		if not ok then
			warn(`{LOG} player setup failed for {player.Name}: {tostring(err)}`)
		end
	end

	Players.PlayerAdded:Connect(function(player)
		task.spawn(handle, player)
	end)

	-- Studio reloads the server script with players already present, and a live
	-- server can in principle finish booting after the first join.
	for _, player in Players:GetPlayers() do
		task.spawn(handle, player)
	end
end

print(`{LOG} {Config.GameName} v{Config.Version} server online`)
