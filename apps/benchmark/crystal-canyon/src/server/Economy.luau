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
	visited: { [string]: boolean },
	stock: { [string]: number },
	trails: { [string]: boolean },
	equipped: string,
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
	Shop: any,
}

--[[ A pure sibling, required directly rather than reached through `ctx`, exactly as
	 DataService requires Profile and Codes requires CodeTable. `ctx` is for SERVICES — things
	 with an `init` and an order in the boot sequence — and adding a module with neither would
	 make the context mean two things. ]]
local Objectives = require(script.Parent.Objectives)

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
--[[ The commit half of a sell, shared by the pad sale and the flare.

	 Every refusal has already happened before this is called, and nothing in it yields. It
	 deliberately does NOT push and does NOT touch the objective: both belong to the caller,
	 because the two callers disagree about them — a flare sale is not at the pad, so it credits
	 no objective, and it has a charge still to spend, so it pushes later.

	 Shards are zeroed BEFORE the coins are credited so that if this ever grows a yield, the
	 failure mode is a lost payout rather than a pack that can be sold twice. ]]
local function commitSell(player: Player, profile: ProfileData, shards: number, now: number)
	profile.shards = 0
	Economy.addCoins(player, shards * ctx.Config.Sell.CoinsPerShard)
	profile.stats.sold += shards
	lastSell[player] = now
end

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

	commitSell(player, profile, shards, now)

	Economy.bumpObjective(player, "sell", 1)
	Economy.push(player)
	return true, nil
end

--[[ Sell with no proximity check — the SIGNAL FLARE's effect, and its only caller.

	 `Net` never reaches this. Its `Sell` handler calls `Economy.sell` and nothing else, so
	 there is no wire on which a client can ask for the position check to be skipped; the only
	 way here is to hold a charge the server sold you.

	 WHAT IS SKIPPED IS POSITION, AND NOTHING ELSE. The cooldown still applies, so a flare
	 cannot be used to beat `Sell.CooldownSeconds`, and an empty pack is still refused, so a
	 charge cannot be burned for nothing.

	 It does NOT bump the `sell` objective. That objective reads "SELL AT THE GOLD PAD" and
	 Config's own comment calls the onboarding chain physical — a flare sale is not at the pad,
	 and crediting it would let a player complete a walk-there step without walking there.

	 It does NOT push, either. The caller has more state to write (the spent charge), and
	 pushing here would put a snapshot on the wire with the coins already moved and the charge
	 not yet spent. ]]
function Economy.sellAnywhere(player: Player): (boolean, string?)
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

	commitSell(player, profile, shards, now)
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

	--[[ Shop state. Prices are deliberately NOT on the wire: upgrade prices ride on Sync because
		 they depend on level, but shop prices are flat constants in a shared, replicated Config —
		 exactly like `zone.UnlockCost`, which the HUD already reads client-side. Sending them
		 would create a second authority for a number that cannot vary. ]]
	local stock: { [string]: number } = {}
	for _, item in ctx.Config.Shop.Consumables do
		stock[item.Id] = math.max(0, math.floor(profile.stock[item.Id] or 0))
	end
	local trails: { [string]: boolean } = {}
	for _, trail in ctx.Config.Shop.Trails do
		trails[trail.Id] = profile.trails[trail.Id] == true
	end

	--[[ The current objective is derived from progress rather than stored, so a
		 profile edited by hand (or an objective list edited in Config) can never
		 leave a player pointed at a step they already finished.

		 The derivation MOVED to `Objectives.resolve` when the objective stopped being a
		 three-element chain and became a function of the whole player state. What used to sit
		 here is now its tier 1, byte-identical, so a new player's experience is unchanged and
		 every existing test stays reachable.

		 Capacity is computed ONCE and passed in rather than recomputed inside the resolver: the
		 snapshot below needs the same number, and two calls would be two chances for the chip
		 to disagree with the gauge it sits directly above. ]]
	local capacity = Economy.packCapacity(player)
	local objective = Objectives.resolve(profile, capacity)

	syncRemote:FireClient(player, {
		coins = profile.coins,
		shards = profile.shards,
		packCapacity = capacity,
		upgrades = upgrades,
		zones = zones,
		--[[ `equipped` is "" and never nil when nothing is equipped. A nil field does not
			 survive the remote boundary at all (the same fact `nextCost` above relies on), and
			 the client must be able to tell "nothing equipped" from "this server does not send
			 the field" — one is a state to draw and the other is a version mismatch. ]]
		shop = { stock = stock, trails = trails, equipped = profile.equipped or "" },
		objective = objective,
		stats = {
			collected = profile.stats.collected,
			sold = profile.stats.sold,
			playtime = profile.stats.playtime,
		},
	})
end

return Economy
