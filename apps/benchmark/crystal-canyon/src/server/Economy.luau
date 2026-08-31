--!strict
--[[
	Crystal Canyon — Economy.

	This module is the only code in the game that mutates currency. Every other
	service asks it to move a number; none of them touch `profile.coins` or
	`profile.shards` themselves. That is not tidiness, it is the exploit
	surface: currency has exactly one door, so auditing the door audits the
	economy.

	Two invariants everything below is built to keep:

	1. The server measures. The client's only say in a sell is that it wants to
	   sell; the position, the shard count, the rate and the payout are all read
	   from server state.
	2. No grant path yields. Between deciding a player can afford something and
	   taking the money there is no `task.wait`, no DataStore call, no remote
	   round-trip — see `spendCoins`.
]]

local Players = game:GetService("Players")

local Economy = {}

type ProfileData = {
	version: number,
	coins: number,
	shards: number,
	upgrades: { [string]: number },
	zones: { [string]: boolean },
	codes: { [string]: boolean },
	objectives: { [string]: number },
	stats: { collected: number, sold: number, playtime: number },
}

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
}

local ctx: Ctx = nil :: any
local syncRemote: RemoteEvent = nil :: any

--[[ Per-player timestamp of the last SUCCESSFUL sell. Failed sells deliberately
	 do not start the cooldown: a player standing off the pad and mashing the
	 button should get told to move, not be locked out for another 0.35s each
	 time they try. ]]
local lastSell: { [Player]: number } = {}

--[[ Currency is stored as a Luau number, which is a double. Integers stay exact
	 up to 2^53; clamping well below that means a long session can never drift
	 into a value where `coins + 1 == coins`, which would silently break every
	 price check downstream. ]]
local MAX_CURRENCY = 1e15

-- Internals ---------------------------------------------------------------

--[[ Coerce anything a caller hands us into a safe integer delta. NaN and the
	 infinities are checked explicitly because both survive `type() == "number"`
	 and both poison every comparison after them: `profile.coins < nan` is false,
	 which would make an affordability check pass. ]]
local function sanitizeAmount(amount: any): number
	if type(amount) ~= "number" then
		return 0
	end
	if amount ~= amount then -- NaN
		return 0
	end
	if amount == math.huge or amount == -math.huge then
		return 0
	end
	return math.floor(amount)
end

--[[ nil while the profile is still loading or failed to load. Every mutator
	 below returns early on nil, which is how the contract's "a player whose
	 profile failed to load is never granted anything" is enforced here. ]]
local function profileOf(player: Player): ProfileData?
	local data = ctx and ctx.Data
	if not data or not data.isReady(player) then
		return nil
	end
	return data.get(player) :: ProfileData?
end

local function objectiveTarget(objectiveId: string): number?
	for _, obj in ctx.Config.Objectives do
		if obj.Id == objectiveId then
			return obj.Target
		end
	end
	return nil
end

--[[ Looked up per call rather than cached at init. The pad is built at edit
	 time so it will be there, but a cached reference to a destroyed instance
	 would keep reporting a stale position forever, and sells are cooldown-capped
	 at a few per second per player so three FindFirstChild calls cost nothing. ]]
local function sellPadPosition(): Vector3?
	local canyon = workspace:FindFirstChild("Canyon")
	local pads = canyon and canyon:FindFirstChild("Pads")
	local pad = pads and pads:FindFirstChild("SellPad")
	if pad and pad:IsA("PVInstance") then
		return pad:GetPivot().Position
	end
	return nil
end

--[[ The character's root part, or nil if the player has no live character.
	 A dead or characterless player has no position the server can trust, so
	 they simply cannot sell. ]]
local function rootPartOf(player: Player): BasePart?
	local character = player.Character
	if not character then
		return nil
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return nil
	end
	local root = character:FindFirstChild("HumanoidRootPart")
	return (root and root:IsA("BasePart")) and root or nil
end

-- Public ------------------------------------------------------------------

function Economy.init(context: Ctx)
	ctx = context

	local sync = ctx.Remotes:FindFirstChild("Sync")
	assert(sync and sync:IsA("RemoteEvent"), "Economy.init: Sync remote missing — Remotes.build() must run first")
	syncRemote = sync

	--[[ Without this the cooldown table pins every Player instance that has ever
		 sold for the lifetime of the server. ]]
	Players.PlayerRemoving:Connect(function(player)
		lastSell[player] = nil
	end)
end

--[[ How many shards this player can carry, from their PACK level. Read live
	 rather than cached: buying pack mid-run must widen the cap immediately, and
	 a cached value is one more thing that can disagree with the profile. ]]
function Economy.packCapacity(player: Player): number
	local profile = profileOf(player)
	local level = if profile then profile.upgrades.pack or 0 else 0
	return math.max(0, math.floor(ctx.Config.upgradeValue("pack", level)))
end

--[[ Returns the amount ACTUALLY added after the pack cap, which is what the
	 caller needs in order to draw an honest number pop — Collect must not show
	 "+5" for a crystal that only fitted 2 shards into a nearly full pack. ]]
function Economy.addShards(player: Player, amount: number): number
	local profile = profileOf(player)
	if not profile then
		return 0
	end

	local want = sanitizeAmount(amount)
	if want <= 0 then
		return 0 -- addShards never removes; a negative "gain" is a caller bug, not a debit
	end

	--[[ Room can come back negative if a corrupt save carried more shards than
		 the current cap allows. Treating that as "full" leaks nothing and lets
		 the player sell their way back to a legal state. ]]
	local room = Economy.packCapacity(player) - profile.shards
	if room <= 0 then
		return 0
	end

	local added = math.min(want, room)
	profile.shards += added
	--[[ Every shard in the game enters through this function, so this is the one
		 place `collected` can be counted without either missing or double-counting.
		 The `collect` objective is bumped by Collect, per the module contract. ]]
	profile.stats.collected += added
	return added
end

function Economy.addCoins(player: Player, amount: number)
	local profile = profileOf(player)
	if not profile then
		return
	end
	local add = sanitizeAmount(amount)
	if add <= 0 then
		return
	end
	profile.coins = math.min(MAX_CURRENCY, profile.coins + add)
end

--[[ Atomic debit: check and subtract with NOTHING between them.

	 This matters because Luau is cooperatively scheduled. Two `Purchase` remotes
	 that arrive in the same frame run as two separate coroutines, and a
	 coroutine only ever loses control at a yield. If this function looked like

	     if profile.coins < cost then return false end
	     task.wait()                     -- or a DataStore call, or FireClient-then-wait
	     profile.coins -= cost

	 then buy #1 could pass the check, yield, let buy #2 pass the SAME check
	 against the un-debited balance, and both would go on to grant an upgrade for
	 one payment — currency duplication with no exploit required, just two clicks
	 in one frame. Because the check and the write below are in one uninterrupted
	 run of code, the second call always sees the debited balance.

	 The corollary is a rule for callers: do not yield between `spendCoins`
	 returning true and applying what was bought. ]]
function Economy.spendCoins(player: Player, amount: number): boolean
	local profile = profileOf(player)
	if not profile then
		return false
	end
	local cost = sanitizeAmount(amount)
	if cost <= 0 then
		return false -- a free or negative purchase is a bug upstream; refuse rather than gift coins
	end
	if profile.coins < cost then
		return false
	end
	profile.coins -= cost
	return true
end

--[[ Advance an onboarding objective. Clamped to its target so the chip can
	 render "25 / 25" instead of "412 / 25" an hour into the session. ]]
function Economy.bumpObjective(player: Player, objectiveId: string, amount: number?)
	local profile = profileOf(player)
	if not profile then
		return
	end
	local target = objectiveTarget(objectiveId)
	if not target then
		return
	end
	local step = sanitizeAmount(amount or 1)
	if step <= 0 then
		return
	end
	profile.objectives[objectiveId] = math.min(target, (profile.objectives[objectiveId] or 0) + step)
end

--[[ Convert carried shards to coins.

	 Order of refusals is deliberate: cooldown first (cheapest, and the only one
	 that is about abuse), then "are you carrying anything", then the position
	 check last because it is the only one that touches instances. ]]
function Economy.sell(player: Player): (boolean, string?)
	local profile = profileOf(player)
	if not profile then
		return false, "SAVE STILL LOADING"
	end

	local now = os.clock()
	local last = lastSell[player]
	if last and now - last < ctx.Config.Sell.CooldownSeconds then
		return false, "SLOW DOWN"
	end

	local shards = math.floor(profile.shards)
	if shards <= 0 then
		return false, "NOTHING TO SELL"
	end

	--[[ The whole point of the trust model: the client said "sell", and the
		 server goes and looks at where the character actually is. A client that
		 lies about its position is not consulted, because it is never asked. ]]
	local root = rootPartOf(player)
	if not root then
		return false, "STAND ON THE GOLD PAD"
	end
	local pad = sellPadPosition()
	if not pad then
		--[[ The world was not built. Refusing (rather than paying out) means a
			 missing pad costs a bug report, not an infinite-money server. ]]
		return false, "SELL PAD UNAVAILABLE"
	end
	if (root.Position - pad).Magnitude > ctx.Config.Sell.PadRadius then
		return false, "STAND ON THE GOLD PAD"
	end

	--[[ Commit. Shards are zeroed BEFORE the coins are credited so that if this
		 ever grows a yield, the failure mode is a lost payout rather than a pack
		 that can be sold twice. ]]
	profile.shards = 0
	Economy.addCoins(player, shards * ctx.Config.Sell.CoinsPerShard)
	profile.stats.sold += shards
	lastSell[player] = now

	Economy.bumpObjective(player, "sell", 1)
	Economy.push(player)
	return true, nil
end

--[[ The authoritative snapshot. The client renders this and nothing else — it
	 never computes a price, a capacity or an unlock state of its own, which is
	 what stops the HUD from advertising something the server will refuse.

	 Upgrade entries carry `nextCost` only below max level. A nil field simply
	 does not survive the remote boundary, so "no nextCost key" is the client's
	 signal to draw MAX — that absence is load-bearing, not an oversight. ]]
function Economy.push(player: Player)
	local profile = profileOf(player)
	if not profile then
		return -- never push a fabricated snapshot for an unloaded profile
	end

	local upgrades: { [string]: any } = {}
	for _, up in ctx.Config.Upgrades do
		local level = math.clamp(math.floor(profile.upgrades[up.Id] or 0), 0, up.MaxLevel)
		upgrades[up.Id] = {
			level = level,
			maxLevel = up.MaxLevel,
			value = ctx.Config.upgradeValue(up.Id, level),
			nextCost = ctx.Config.upgradeCost(up.Id, level),
		}
	end

	local zones: { [string]: boolean } = {}
	for index, zone in ctx.Config.Zones do
		-- Index 1 is the starting zone and is unlocked by definition (Config order).
		zones[zone.Id] = index == 1 or profile.zones[zone.Id] == true
	end

	--[[ The current objective is derived from progress rather than stored, so a
		 profile edited by hand (or an objective list edited in Config) can never
		 leave a player pointed at a step they already finished. ]]
	local objectives = ctx.Config.Objectives
	local objective = {
		index = #objectives + 1,
		id = "",
		text = "",
		progress = 0,
		target = 0,
		complete = true,
	}
	for i, obj in objectives do
		local progress = math.min(obj.Target, profile.objectives[obj.Id] or 0)
		if progress < obj.Target then
			objective = {
				index = i,
				id = obj.Id,
				text = obj.Text,
				progress = progress,
				target = obj.Target,
				complete = false,
			}
			break
		end
	end

	syncRemote:FireClient(player, {
		coins = profile.coins,
		shards = profile.shards,
		packCapacity = Economy.packCapacity(player),
		upgrades = upgrades,
		zones = zones,
		objective = objective,
		stats = {
			collected = profile.stats.collected,
			sold = profile.stats.sold,
			playtime = profile.stats.playtime,
		},
	})
end

return Economy
