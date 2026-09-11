--!strict
--[[
	Crystal Canyon — zone ownership and the gate.

	## Why the gate does not collide

	A gate that physically blocks a locked player has to decide, per player,
	whether a part is solid. Roblox gives two ways to do that and both are
	unsound as a security boundary:

	  * a server-side CanCollide toggle is global — it cannot be per player at
	    all, so one unlocked player opens the gate for everybody;
	  * a client-owned local barrier IS per player, but it lives on the machine
	    of the person it is meant to stop. Deleting it is a one-line exploit.

	So collision is treated as decoration, not enforcement. The gate part stays
	CanCollide = false for everyone, the server publishes each player's state as
	a `zone_<id>` attribute, and the client reads that attribute to draw its own
	copy of the gate solid-red-and-opaque or open. An exploiter can therefore
	walk into Frost Hollow whenever they like — and gain nothing, because
	Collect refuses to award a crystal in a zone this module says is locked.
	Walking through a cosmetic wall is not an exploit; being paid on the other
	side of it would be.

	Attributes are used rather than a remote because they are replicated state
	the engine keeps consistent: a client that joins late, respawns, or misses a
	frame still reads the current value instead of a cue it was not around for.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(Shared:WaitForChild("Config"))
local Util = require(Shared:WaitForChild("Util"))
local Palette = require(Shared:WaitForChild("Palette"))

type Ctx = {
	Config: any,
	Util: any,
	Remotes: Folder,
	Data: any,
	Economy: any,
	Upgrades: any,
	Zones: any,
	Collect: any,
	Codes: any,
	Shop: any,
}

local Zones = {}

local ctx: Ctx = nil :: any
local remoteUnlocked: RemoteEvent = nil :: any
local remoteNotify: RemoteEvent = nil :: any

local ATTR_PREFIX = "zone_"
local PROFILE_POLL = 0.25
local PROFILE_TIMEOUT = 45

--[[ A zone that costs nothing is the starting zone; Config's ordering comment
	 makes index 1 free, and reading the cost rather than the index means adding
	 a second free zone later needs no change here. ]]
local function isFreeZone(zone: any): boolean
	return (zone.UnlockCost or 0) <= 0
end

local function attributeName(zoneId: string): string
	return ATTR_PREFIX .. zoneId
end

--[[ Publish this player's view of every gate. Called on load, on unlock, and on
	 respawn — attributes survive respawns, but re-publishing is idempotent and
	 removes any question about ordering against character replication. ]]
function Zones.refresh(player: Player)
	for _, zone in Config.Zones do
		player:SetAttribute(attributeName(zone.Id), Zones.isUnlocked(player, zone.Id))
	end
end

function Zones.isUnlocked(player: Player, zoneId: string): boolean
	if type(zoneId) ~= "string" then
		return false
	end
	local zone = Config.zoneById(zoneId)
	if not zone then
		return false
	end
	if isFreeZone(zone) then
		return true
	end
	-- No profile means the load is still in flight or has failed. Either way the
	-- player owns nothing: a failed load must never be treated as ownership.
	local profile = ctx.Data.get(player)
	if not profile or not profile.zones then
		return false
	end
	return profile.zones[zoneId] == true
end

--[[ Returns (ok, reason). The reason string is shown to the player verbatim by
	 Net, so it is written as player-facing copy rather than an error code. ]]
function Zones.unlock(player: Player, zoneId: string): (boolean, string?)
	if type(zoneId) ~= "string" then
		return false, "UNKNOWN ZONE"
	end

	local zone = Config.zoneById(zoneId)
	if not zone then
		return false, "UNKNOWN ZONE"
	end

	local profile = ctx.Data.get(player)
	if not profile then
		return false, "STILL LOADING — TRY AGAIN"
	end

	if Zones.isUnlocked(player, zoneId) then
		return false, "ALREADY UNLOCKED"
	end

	local cost = math.max(0, math.floor(zone.UnlockCost))

	-- spendCoins is the atomic check-and-debit. Doing the affordability test
	-- here as well would open the classic double-spend: two Unlock events in the
	-- same frame both pass a separate check, then both debit. The only test that
	-- counts is the one inside spendCoins.
	if not ctx.Economy.spendCoins(player, cost) then
		return false, `NEED {Util.comma(cost)} COINS`
	end

	profile.zones[zoneId] = true
	Zones.refresh(player)

	remoteUnlocked:FireClient(player, { zoneId = zoneId })
	remoteNotify:FireClient(player, {
		kind = "success",
		text = `{zone.Name} UNLOCKED`,
	})
	-- The coins are already gone from the profile; push so the HUD stops showing
	-- the pre-purchase balance.
	ctx.Economy.push(player)

	return true, nil
end

--[[ Gates are built at edit time by world/Build.luau. This pass is defensive: it
	 forces the non-colliding contract described at the top of this file onto
	 whatever the world builder produced, and tags each gate with its zone id so
	 the client can find the one it needs without a name convention of its own. ]]
local function prepareGates()
	local canyon = Workspace:FindFirstChild("Canyon")
	local gates = canyon and canyon:FindFirstChild("Gates")
	if not gates then
		return
	end

	for _, zone in Config.Zones do
		local gate = gates:FindFirstChild(zone.Id)
		if gate then
			gate:SetAttribute("zoneId", zone.Id)
			for _, descendant in gate:GetDescendants() do
				if descendant:IsA("BasePart") then
					descendant.CanCollide = false
					descendant.Anchored = true
					descendant.CanTouch = false
					-- The server paints the locked state and never repaints it:
					-- the part is shared by every player, so its colour cannot
					-- carry per-player meaning. The client recolours its own copy.
					descendant.Color = Palette.Pads.Gate
				end
			end
		end
	end
end

--[[ DataService has no "profile loaded" signal in the contract, so readiness is
	 polled. One short-lived thread per player — not per crystal, not per frame —
	 and it exits as soon as the profile lands or the player leaves. ]]
local function publishWhenReady(player: Player)
	task.spawn(function()
		local deadline = os.clock() + PROFILE_TIMEOUT
		while player.Parent and os.clock() < deadline do
			if ctx.Data.isReady(player) then
				Zones.refresh(player)
				return
			end
			task.wait(PROFILE_POLL)
		end
		-- Timed out or the player left. Publishing the locked state anyway keeps
		-- the client's gate consistent with what Collect will actually award,
		-- which is nothing.
		if player.Parent then
			Zones.refresh(player)
		end
	end)
end

function Zones.init(context: Ctx)
	ctx = context

	remoteUnlocked = ctx.Remotes:WaitForChild("Unlocked") :: RemoteEvent
	remoteNotify = ctx.Remotes:WaitForChild("Notify") :: RemoteEvent

	prepareGates()

	local function track(player: Player)
		publishWhenReady(player)
		player.CharacterAdded:Connect(function()
			Zones.refresh(player)
		end)
	end

	Players.PlayerAdded:Connect(track)
	-- Players already present when the server script finishes booting: in Studio
	-- play-solo the local player can beat PlayerAdded to this connection.
	for _, player in Players:GetPlayers() do
		track(player)
	end
end

return Zones
