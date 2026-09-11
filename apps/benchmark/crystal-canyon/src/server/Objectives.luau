--!strict
--[[
	Crystal Canyon — what the player should do next.

	## Why this module exists

	`Economy.push` derived the objective by walking `Config.Objectives` and taking the first
	incomplete step. When all three were satisfied it sent the sentinel `index = 4`,
	`complete = true`, empty text — and `Objective.luau` responded to `complete` by hiding the
	chip. So the top-centre slot was dead from the moment step 3 landed, permanently, for
	everyone. The visual critic filed it as V10; §3 of the owner's ruling is that the slot must
	become a real contextual objective HUD or disappear.

	The fix is not "put something in the slot". It is to make the objective a function of the
	WHOLE player state rather than of a three-element list.

	## Why it is on the server, and why it is its own file

	The project rule is that the client renders and never decides, and there is a real
	counter-argument here: this is a pure function of a snapshot the client already holds, and
	`Hud.render` already derives affordability dots client-side. Three things settle it:

	1. The derivation ALREADY exists on the server and has one authority. A second,
	   differently-shaped derivation on the client is the exact shape of F-16 and F-29 — a
	   second copy that loads, runs, finds its target, and quietly disagrees.
	2. One tier is not derivable from the client's snapshot at all. `visited` is deliberately
	   not on the wire, because `Economy.push` publishes only what is read. A ladder split
	   six-on-the-client and one-on-the-server is worse than either whole ladder.
	3. `Objective.luau` already says so: "the server's own strings are what the player is being
	   graded against." A client that composed its own strings would make that comment false.

	It is a SEPARATE MODULE rather than more code inside `Economy.push` because `Economy`
	requires `Players` and holds a live remote, so it cannot be loaded in the standalone Luau
	harness. This takes a plain table and a number and returns a plain table, so
	`tests/objectives.spec.luau` can drive all seven tiers without Roblox.

	Pure and total: no services, no yields, no `Player`, no `os`/`tick`. The same profile and
	capacity always produce the same record.

	## Stability, which is a property and not a hope

	A resolver that oscillated between two answers on consecutive Syncs would fire a transition
	ten times a second. Every transition here is caused by a monotone crossing or a discrete
	purchase: `shards` rises between sells and drops only to zero ON a sell; `coins` falls only
	on a purchase, which also RAISES `nextPrice` for that upgrade; `visited` is a latch that is
	never cleared. Tiers 2 and 5 cannot flip-flop because tier 2 needs `shards >= capacity`,
	tier 5 needs `shards > 0`, and tier 2 outranks tier 5. `objectives.spec.luau` walks a
	scripted session and asserts the id sequence contains no adjacent A → B → A.

	## The invariant every future writer must respect

	EVERY WRITER OF A RESOLVER INPUT ALSO CALLS `Economy.push`. Today that holds: coins, shards,
	upgrades and zones change only through `Economy`, `Upgrades.purchase`, `Zones.unlock`,
	`Codes.redeem` and the `Collect` sweep, and every one pushes. The new `visited` latch pushes
	too. There is deliberately no periodic Sync and this does not add one — a resolver needing a
	heartbeat would be reading something that is not an economy fact.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Config = require(ReplicatedStorage:WaitForChild("CrystalCanyon"):WaitForChild("Config")) :: any

local Objectives = {}

export type Record = {
	index: number,
	id: string,
	text: string,
	progress: number,
	target: number,
	complete: boolean,
}

--[[ Thousands separators, because `REACH 19835 COINS` is a number and
	 `REACH 19,835 COINS` is a price. Written by hand rather than with a `%d`-with-locale trick
	 because Luau has no locale and inventing one would be a second formatting authority. ]]
local function comma(n: number): string
	local whole = tostring(math.floor(n))
	local out = whole
	local count
	repeat
		out, count = string.gsub(out, "^(-?%d+)(%d%d%d)", "%1,%2")
	until count == 0
	return out
end

Objectives.comma = comma

--[[ The cheapest thing in the game the player does not yet own.

	 Returns the price, a kind (`"zone"` or `"upgrade"`) and the subject's id, or nil when the
	 player owns everything purchasable.

	 SCOPE, STATED SO IT IS NOT DISCOVERED LATER. This iterates `Config.Zones` and
	 `Config.Upgrades` and nothing else. If a SHOP with its own priced inventory is added to
	 `Config`, this ladder will not see it: tier 6 would point at the wrong price and tier 7
	 would fire `complete = true` — collapsing the chip with unbought items on the board, which
	 is the very hole (V10) this module exists to close. Whoever adds `Config.Shop` must either
	 extend the candidate set here or record why the shop is deliberately out of scope.

	 Ties: a zone beats an upgrade at the same price, because a zone is a step change in the
	 whole loop (5x shard value) while an upgrade is a slope change. Among upgrades the cheapest
	 wins, with `Config` order (pack, speed, magnet) as the deterministic tie-break — which
	 front-loads PACK, the upgrade that lengthens every other loop. The chip is a hint; the
	 UPGRADES panel remains where the player actually chooses. ]]
local function nextPurchase(profile: any): (number?, string?, string?)
	local bestPrice: number? = nil
	local bestKind: string? = nil
	local bestId: string? = nil

	for _, zone in Config.Zones do
		if zone.UnlockCost > 0 and profile.zones[zone.Id] ~= true then
			if bestPrice == nil or zone.UnlockCost < bestPrice then
				bestPrice, bestKind, bestId = zone.UnlockCost, "zone", zone.Id
			end
		end
	end

	for _, up in Config.Upgrades do
		local level = profile.upgrades[up.Id] or 0
		local cost = Config.upgradeCost(up.Id, level)
		-- nil at MaxLevel: `upgradeCost` returns nil rather than a price for a level that can
		-- never be charged, so there is nothing to compare and nothing to point at.
		if cost ~= nil and (bestPrice == nil or cost < bestPrice) then
			bestPrice, bestKind, bestId = cost, "upgrade", up.Id
		end
	end

	return bestPrice, bestKind, bestId
end

Objectives.nextPurchase = nextPurchase

--[[ Resolve the player's single primary objective.

	 First match wins, and the order encodes a design argument rather than a convenience:

	 1. THE ONBOARDING CHAIN, untouched. A new player's experience is byte-identical to what
	    shipped, which is also what makes this change reviewable — every existing behaviour and
	    every existing test stays reachable and unchanged.
	 2. PACK FULL, above everything, because a full pack is the game's only hard block: `Collect`
	    refuses the award and leaves the crystal standing. The gauge is already red and SELL is
	    already pulsing, so the chip AGREES with two existing signals rather than inventing a
	    third.
	 3. EXPLORE a zone that is owned but never entered — free-and-immediate beats expensive, and
	    it closes the dead beat straight after the biggest purchase in the game.
	 4. BUY the cheapest thing you can already afford.
	 5. SELL, but only when selling is what unblocks the thing in tier 4. This is the tier that
	    makes the HUD feel alive: the tier-6 bar fills, and the instant a sell would complete it
	    the chip flips to SELL YOUR SHARDS.
	 6. SAVE toward that price — the only tier that draws the progress capsule, which is the
	    widget the chip already has and, post-onboarding, had nothing to use for.
	 7. Nothing left. Genuinely reachable with 2 zones and 30 upgrade levels, so it is handled
	    rather than dismissed as impossible.

	 A NOTE ON TIERS 3 AND 4, because the plan this was built from got it wrong and the wrong
	 version is the more comfortable one to believe. The plan said they "never actually contend"
	 with the shipped two-zone Config, reasoning that a zone is either locked-and-affordable or
	 owned-and-unvisited, never both. That is true of ZONES and the tier is not about zones
	 alone: tier 4 also covers upgrades, so `explore:frost` outranks `buy:pack` for the whole
	 walk south after an unlock. That is the most common mid-game state, not a corner case. ]]
function Objectives.resolve(profile: any, packCapacity: number): Record
	local sentinel = #Config.Objectives + 1

	-- Tier 1 — the onboarding chain, byte-identical to what Economy.push used to build.
	for i, obj in Config.Objectives do
		local progress = math.min(obj.Target, (profile.objectives and profile.objectives[obj.Id]) or 0)
		if progress < obj.Target then
			return {
				index = i,
				id = obj.Id,
				text = obj.Text,
				progress = progress,
				target = obj.Target,
				complete = false,
			}
		end
	end

	--[[ Everything below carries the sentinel index. That is not bookkeeping: the client
		 celebrates on `step.index > shownIndex`, so a permanently-pinned index makes the
		 celebration STRUCTURALLY unreachable for contextual objectives instead of guarded
		 against. ]]
	local function contextual(id: string, text: string, progress: number, target: number): Record
		return { index = sentinel, id = id, text = text, progress = progress, target = target, complete = false }
	end

	local shards = profile.shards or 0
	local coins = profile.coins or 0

	-- Tier 2 — the only hard block in the game.
	if packCapacity > 0 and shards >= packCapacity then
		return contextual("sell:full", "PACK FULL — SELL", 0, 0)
	end

	-- Tier 3 — paid for, never stood in.
	local visited = profile.visited or {}
	for _, zone in Config.Zones do
		if zone.UnlockCost > 0 and profile.zones[zone.Id] == true and visited[zone.Id] ~= true then
			return contextual("explore:" .. zone.Id, "EXPLORE " .. zone.Name, 0, 0)
		end
	end

	local price, kind, subject = nextPurchase(profile)

	-- Tier 7, taken early because the tiers below all need a price to point at.
	if price == nil then
		return { index = sentinel, id = "", text = "", progress = 0, target = 0, complete = true }
	end

	-- Tier 4 — affordable now.
	if coins >= price then
		if kind == "zone" then
			local zone = Config.zoneById(subject)
			return contextual("unlock:" .. (subject :: string), "UNLOCK " .. (zone and zone.Name or "ZONE"), 0, 0)
		end
		local up = Config.upgradeById(subject)
		return contextual("buy:" .. (subject :: string), "BUY " .. (up and up.Name or "UPGRADE"), 0, 0)
	end

	-- Tier 5 — selling is what unblocks tier 4.
	local rate = Config.Sell.CoinsPerShard
	if shards > 0 and coins + shards * rate >= price then
		return contextual("sell:goal", "SELL YOUR SHARDS", 0, 0)
	end

	--[[ Tier 6 — the long middle, and the only tier that draws the capsule.

		 The capsule's widest possible content is `19,834/19,835`, 13 characters, because the
		 most expensive purchasable thing in the game is magnet level 9 at
		 `floor(100 * 1.8^9)` = 19,835. That number is worth stating because BOTH reviews that
		 computed it got it wrong — the design plan said 30,764 (an order of magnitude out) and
		 the integrator that caught the plan said 19,836 (out by one). The conclusion survived
		 both errors, which is exactly why `Objective.luau` measures `TextBounds` and constrains
		 the label rather than trusting anybody's arithmetic. ]]
	return contextual("save:coins", "REACH " .. comma(price) .. " COINS", math.min(coins, price), price)
end

return Objectives
