--!strict
--[[
	Crystal Canyon — the trust boundary.

	Every packet an exploiter can author enters the game through this file, and
	nothing downstream re-checks what this file lets through. It is written on
	the assumption that a client is hostile, well-resourced, and specifically
	trying to make the server misbehave rather than to cheat quietly.

	Four things it guarantees:

	1. RATE. A per-player, per-remote token bucket, refilled continuously from
	   `os.clock()` rather than reset on a timer. A debounce ("one call per
	   0.2s") lets a script fire at exactly the debounce rate forever; a bucket
	   caps the sustained rate at RefillPerSecond while still allowing the short
	   burst a human produces by mashing a button.

	2. SHAPE. Arity and type of every argument are checked before dispatch.
	   Anything else is dropped. The declared shapes come from Remotes.luau:
	   Purchase(string), Sell(), Redeem(string), Unlock(string).

	3. READINESS. No dispatch for a player without a loaded profile. A player
	   mid-load has no authoritative state to mutate, and mutating a placeholder
	   is how currency gets duplicated or erased.

	4. SURVIVAL. A malformed packet never errors out of the handler and never
	   kicks. An exploiter who can make the handler throw can spam the error
	   path; an exploiter who can make it kick has a griefing tool. Every call
	   into a sibling service is wrapped, and a thrown error is logged with the
	   remote name so it can be attributed instead of vanishing.
]]

local Players = game:GetService("Players")

local Net = {}

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

type Bucket = { tokens: number, last: number }

local ctx: Ctx = nil :: any
local notifyRemote: RemoteEvent? = nil

local buckets: { [Player]: { [string]: Bucket } } = {}
local lastNotify: { [Player]: number } = {}

--[[ Remote name -> the Config.RateLimits key that governs it. `Redeem` is
	 metered by the `Code` bucket because that is what Config calls it; keeping
	 the mapping explicit means a remote with no declared limit is a visible
	 hole here rather than an accidentally unlimited endpoint. ]]
local LIMIT_KEY: { [string]: string } = {
	Purchase = "Purchase",
	Sell = "Sell",
	Redeem = "Code",
	Unlock = "Unlock",
	--[[ Both spending remotes take Purchase's rate. They map to the same LIMIT_KEY but get
		 SEPARATE buckets: `takeToken` keys its buckets by remote NAME and only reads the
		 parameters through this table, so spending a BuyItem token does not slow UseItem down.
		 A reader will assume otherwise. ]]
	BuyItem = "Item",
	UseItem = "Item",
	Equip = "Equip",
}

--[[ A transport-level sanity bound on any string argument, not a game rule —
	 the game rules for code length live in Config.CodeInput.MaxLength and are
	 enforced by Codes itself. This exists only so a client cannot make the
	 server hold a multi-megabyte string per packet. It is deliberately far
	 above every legitimate id and code length. ]]
local MAX_ARG_BYTES = 128

--[[ Rejections are reported to the player, but the report is throttled. An
	 untrottled notify turns an inbound packet flood into an outbound one at the
	 same rate — the rejection path would become the amplifier. One toast per
	 second is enough for a real player who mistyped a code and useless to
	 someone flooding. ]]
local NOTIFY_INTERVAL = 1

local function log(remoteName: string, message: string)
	warn(`[CrystalCanyon/Net] {remoteName}: {message}`)
end

local function notify(player: Player, kind: string, text: string)
	local remote = notifyRemote
	if not remote then
		return
	end
	remote:FireClient(player, { kind = kind, text = text })
end

-- Every refusal funnels through here so the throttle cannot be bypassed by
-- adding a new rejection branch later.
local function reject(player: Player, text: string)
	local now = os.clock()
	local previous = lastNotify[player]
	if previous and (now - previous) < NOTIFY_INTERVAL then
		return
	end
	lastNotify[player] = now
	notify(player, "error", text)
end

--[[ Continuous-refill token bucket. Returns true and spends a token, or false
	 and spends nothing. Buckets start full so a player's first action after
	 joining is never refused. ]]
local function takeToken(player: Player, remoteName: string): boolean
	local limitKey = LIMIT_KEY[remoteName]
	if not limitKey then
		return false
	end
	local limits = ctx.Config.RateLimits[limitKey]
	if not limits then
		-- Fail closed. A remote whose limit was deleted from Config becomes
		-- unusable rather than unlimited.
		return false
	end

	local perPlayer: { [string]: Bucket } = buckets[player] or {}
	buckets[player] = perPlayer

	local now = os.clock()
	local bucket: Bucket = perPlayer[remoteName] or { tokens = limits.Burst, last = now }
	perPlayer[remoteName] = bucket

	-- Credit elapsed time, clamped at Burst so idling never banks more than one
	-- burst's worth of calls. math.max guards the clock going backwards, which
	-- os.clock should never do but which would otherwise hand out free tokens.
	local elapsed = math.max(0, now - bucket.last)
	bucket.tokens = math.min(limits.Burst, bucket.tokens + elapsed * limits.RefillPerSecond)
	bucket.last = now

	if bucket.tokens < 1 then
		return false
	end
	bucket.tokens -= 1
	return true
end

--[[ Exactly one string argument, within the transport bound. Returns nil for
	 anything else — including one string plus trailing junk, which is what a
	 fuzzing client sends first. ]]
local function oneString(...: any): string?
	if select("#", ...) ~= 1 then
		return nil
	end
	local value = ...
	if type(value) ~= "string" then
		return nil
	end
	if #value > MAX_ARG_BYTES then
		return nil
	end
	return value
end

local function noArgs(...: any): boolean
	return select("#", ...) == 0
end

--[[ Call into a sibling service without letting it take the handler down.

	Roblox spawns a fresh thread per remote fire, so an unhandled error would
	not literally sever the connection for other players. What it would do is
	abandon this packet mid-way with no attribution and flood the server log at
	whatever rate the exploiter chooses. pcall gives us the remote name in the
	log line and a defined outcome for the caller. ]]
local function callService(remoteName: string, fn: any, ...: any): (boolean, any, any)
	if type(fn) ~= "function" then
		log(remoteName, "target service method is missing")
		return false, nil, nil
	end
	local ok, a, b = pcall(fn, ...)
	if not ok then
		log(remoteName, `handler errored: {tostring(a)}`)
		return false, nil, nil
	end
	return true, a, b
end

--[[ Wire one c2s remote. The guard order is fixed: bucket first (it is the
	 cheapest check and the one that has to hold under a flood), then profile
	 readiness, then argument shape, then the service. ]]
local function connect(remoteName: string, handler: (Player, ...any) -> ())
	local remote = ctx.Remotes:FindFirstChild(remoteName)
	if not remote or not remote:IsA("RemoteEvent") then
		log(remoteName, "remote missing from the Remotes folder; not wired")
		return
	end

	remote.OnServerEvent:Connect(function(player: Player, ...: any)
		if not takeToken(player, remoteName) then
			reject(player, "Slow down.")
			return
		end

		local ok, ready = callService(remoteName, ctx.Data.isReady, player)
		if not ok then
			reject(player, "Something went wrong.")
			return
		end
		if not ready then
			reject(player, "Your data is still loading.")
			return
		end

		handler(player, ...)
	end)
end

function Net.init(context: Ctx)
	ctx = context

	local found = ctx.Remotes:FindFirstChild("Notify")
	if found and found:IsA("RemoteEvent") then
		notifyRemote = found
	else
		log("Notify", "remote missing; rejections will be silent")
	end

	connect("Purchase", function(player, ...)
		local upgradeId = oneString(...)
		if not upgradeId then
			reject(player, "That request wasn't understood.")
			return
		end
		local ok, granted, reason = callService("Purchase", ctx.Upgrades.purchase, player, upgradeId)
		if not ok then
			reject(player, "Something went wrong.")
			return
		end
		if not granted then
			reject(player, type(reason) == "string" and reason or "You can't buy that.")
		end
	end)

	--[[ The three shop verbs, each the same shape as Purchase above: validate the one string
		 argument at the boundary, call the service through `callService`, and hand the
		 service's own player-facing reason back. Nothing here decides anything — `Shop` owns
		 every refusal, including the ones only it can see (ALREADY STOCKED, NONE LEFT, the
		 ownership check on equip). ]]
	connect("BuyItem", function(player, ...)
		local itemId = oneString(...)
		if not itemId then
			reject(player, "That request wasn't understood.")
			return
		end
		local ok, granted, reason = callService("BuyItem", ctx.Shop.buy, player, itemId)
		if not ok then
			reject(player, "Something went wrong.")
			return
		end
		if not granted then
			reject(player, type(reason) == "string" and reason or "You can't buy that.")
		end
	end)

	connect("UseItem", function(player, ...)
		local itemId = oneString(...)
		if not itemId then
			reject(player, "That request wasn't understood.")
			return
		end
		local ok, granted, reason = callService("UseItem", ctx.Shop.use, player, itemId)
		if not ok then
			reject(player, "Something went wrong.")
			return
		end
		if not granted then
			reject(player, type(reason) == "string" and reason or "You can't use that.")
		end
	end)

	connect("Equip", function(player, ...)
		--[[ "" is a legal argument here and means unequip, which is why this reads the value
			 rather than testing it for truthiness. `oneString` returns "" as a string; only a
			 non-string or an over-long one comes back nil. ]]
		local trailId = oneString(...)
		if trailId == nil then
			reject(player, "That request wasn't understood.")
			return
		end
		local ok, granted, reason = callService("Equip", ctx.Shop.equip, player, trailId)
		if not ok then
			reject(player, "Something went wrong.")
			return
		end
		if not granted then
			reject(player, type(reason) == "string" and reason or "You can't equip that.")
		end
	end)

	connect("Sell", function(player, ...)
		if not noArgs(...) then
			reject(player, "That request wasn't understood.")
			return
		end
		local ok, sold, reason = callService("Sell", ctx.Economy.sell, player)
		if not ok then
			reject(player, "Something went wrong.")
			return
		end
		if not sold then
			reject(player, type(reason) == "string" and reason or "You can't sell right now.")
		end
	end)

	connect("Redeem", function(player, ...)
		local code = oneString(...)
		if not code then
			reject(player, "That request wasn't understood.")
			return
		end
		local ok, redeemed, message = callService("Redeem", ctx.Codes.redeem, player, code)
		if not ok then
			reject(player, "Something went wrong.")
			return
		end
		-- Codes owns its own copy in both directions, so the success message is
		-- shown verbatim rather than being restated here. A refusal still goes
		-- through `reject` so it inherits the notify throttle.
		if redeemed then
			notify(player, "success", type(message) == "string" and message or "Code redeemed!")
		else
			reject(player, type(message) == "string" and message or "That code isn't valid.")
		end
	end)

	connect("Unlock", function(player, ...)
		local zoneId = oneString(...)
		if not zoneId then
			reject(player, "That request wasn't understood.")
			return
		end
		local ok, unlocked, reason = callService("Unlock", ctx.Zones.unlock, player, zoneId)
		if not ok then
			reject(player, "Something went wrong.")
			return
		end
		if not unlocked then
			reject(player, type(reason) == "string" and reason or "You can't unlock that yet.")
		end
	end)

	-- Per-player state is keyed by the Player instance and would otherwise
	-- accumulate for the life of the server across rejoins.
	Players.PlayerRemoving:Connect(function(player)
		buckets[player] = nil
		lastNotify[player] = nil
	end)
end

return Net
