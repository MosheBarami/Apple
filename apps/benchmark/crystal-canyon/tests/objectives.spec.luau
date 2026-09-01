--!nocheck
--!modules Config=shared/Config,CodeTable=server/CodeTable,Profile=server/Profile,Objectives=server/Objectives
--[[
	`Objectives.resolve` — the seven-tier ladder that decides what the top-centre chip says.

	WHY THIS FILE IS WORTH ITS LENGTH. The bug it replaces (V10) was not a crash. The slot went
	blank the moment onboarding finished and stayed blank forever, and nothing anywhere errored.
	The whole class of failure here is "runs, decides, and is silently wrong", so the assertions
	are about WHICH answer comes back, and about the ORDER the answers arrive in over a session —
	not about whether the call succeeds.

	`Profile.new()` builds every fixture, so a field added to the schema cannot leave these
	tests driving a shape the game no longer has.
]]

local function player(edit: ((any) -> ())?): any
	local p = Profile.new()
	if edit then
		edit(p)
	end
	return p
end

--- Finish the onboarding chain, so the contextual tiers are reachable.
local function graduated(edit: ((any) -> ())?): any
	return player(function(p)
		for _, obj in Config.Objectives do
			p.objectives[obj.Id] = obj.Target
		end
		if edit then
			edit(p)
		end
	end)
end

local SENTINEL = #Config.Objectives + 1
local CAPACITY = Config.upgradeValue("pack", 0)

-- --------------------------------------------------------------- tier 1: the chain
H.test("a brand new player gets chain step 1, byte-identical to what shipped", function()
	local r = Objectives.resolve(player(), CAPACITY)
	H.eq(r.index, 1, "index")
	H.eq(r.id, "collect", "id")
	H.eq(r.text, Config.Objectives[1].Text, "text")
	H.eq(r.target, Config.Objectives[1].Target, "target")
	H.eq(r.complete, false, "complete")
end)

H.test("chain progress is reported and clamped to the target", function()
	local r = Objectives.resolve(player(function(p) p.objectives.collect = 9 end), CAPACITY)
	H.eq(r.progress, 9, "progress")
	local over = Objectives.resolve(player(function(p) p.objectives.collect = 999 end), CAPACITY)
	H.eq(over.id, "sell", "an overshot step 1 advances rather than reporting 999/25")
end)

H.test("the chain is walked in Config order", function()
	local r = Objectives.resolve(player(function(p)
		p.objectives.collect = Config.Objectives[1].Target
		p.objectives.sell = Config.Objectives[2].Target
	end), CAPACITY)
	H.eq(r.id, "upgrade", "id")
	H.eq(r.index, 3, "index")
end)

--[[ THE REGRESSION THAT MATTERS. Before this module, finishing step 3 produced
	 `complete = true` and the client hid the chip permanently. If anyone ever reintroduces
	 that, this is the assertion that fails. ]]
H.test("finishing the chain does NOT end the objective", function()
	local r = Objectives.resolve(graduated(), CAPACITY)
	H.eq(r.complete, false, "the slot must not go dead when onboarding ends")
	H.ok(r.text ~= "", "and it must have something to say")
	H.eq(r.index, SENTINEL, "every contextual objective carries the chain's terminator")
end)

-- --------------------------------------------------------------- tier 2: pack full
H.test("a full pack outranks everything below it", function()
	local r = Objectives.resolve(graduated(function(p)
		p.shards = CAPACITY
		p.coins = 999999 -- could afford anything; tier 2 still wins
	end), CAPACITY)
	H.eq(r.id, "sell:full", "id")
	H.eq(r.index, SENTINEL, "index")
end)

H.test("a pack one shard short of full is not full", function()
	local r = Objectives.resolve(graduated(function(p) p.shards = CAPACITY - 1 end), CAPACITY)
	H.ok(r.id ~= "sell:full", "got " .. r.id)
end)

H.test("a zero capacity cannot make an empty pack full", function()
	-- Guards the `packCapacity > 0` term: without it, 0 >= 0 reports PACK FULL to a player
	-- carrying nothing, which is the most confusing possible first frame.
	local r = Objectives.resolve(graduated(), 0)
	H.ok(r.id ~= "sell:full", "got " .. r.id)
end)

-- --------------------------------------------------------------- tier 3: explore
H.test("a zone that is owned but never entered asks to be explored", function()
	local r = Objectives.resolve(graduated(function(p)
		p.zones.frost = true
		p.visited.frost = false
	end), CAPACITY)
	H.eq(r.id, "explore:frost", "id")
	H.ok(string.find(r.text, "FROST") ~= nil, "the text names the zone: " .. r.text)
end)

H.test("visiting the zone retires the objective", function()
	local r = Objectives.resolve(graduated(function(p)
		p.zones.frost = true
		p.visited.frost = true
	end), CAPACITY)
	H.ok(r.id ~= "explore:frost", "got " .. r.id)
end)

H.test("a zone that is NOT owned is never offered for exploring", function()
	local r = Objectives.resolve(graduated(function(p)
		p.zones.frost = false
		p.visited.frost = false
	end), CAPACITY)
	H.ok(r.id ~= "explore:frost", "buying is not visiting, and neither is not buying")
end)

--[[ The integrator's correction, pinned. The plan claimed tiers 3 and 4 "never actually
	 contend" — true of ZONES, false of the tier, because tier 4 also covers upgrades. This is
	 the most common mid-game state in the game: just unlocked Frost, has not walked there,
	 can afford an upgrade. ]]
H.test("EXPLORE outranks an affordable UPGRADE — tiers 3 and 4 do contend", function()
	local r = Objectives.resolve(graduated(function(p)
		p.zones.frost = true
		p.visited.frost = false
		p.coins = 100000
	end), CAPACITY)
	H.eq(r.id, "explore:frost", "free-and-immediate beats expensive")
end)

-- --------------------------------------------------------------- tier 4: buy
H.test("an affordable purchase is named, and it is the cheapest one", function()
	local cheapest = nil
	for _, up in Config.Upgrades do
		local c = Config.upgradeCost(up.Id, 0)
		if cheapest == nil or c < cheapest then cheapest = c end
	end
	local r = Objectives.resolve(graduated(function(p) p.coins = cheapest end), CAPACITY)
	H.eq(r.id, "buy:pack", "pack is the cheapest at level 0")
	H.ok(string.find(r.text, "BUY") == 1, "text: " .. r.text)
end)

H.test("a zone beats an upgrade of the same price", function()
	-- Constructed rather than hoped for: price every upgrade out of reach except one set to
	-- exactly the zone's cost, and check the zone still wins.
	local zone = nil
	for _, z in Config.Zones do
		if z.UnlockCost > 0 then zone = z break end
	end
	H.ok(zone ~= nil, "the fixture needs a paid zone")
	local r = Objectives.resolve(graduated(function(p)
		p.coins = zone.UnlockCost
		-- Max out every upgrade so `nextPurchase` has only the zone to offer.
		for _, up in Config.Upgrades do
			p.upgrades[up.Id] = up.MaxLevel
		end
	end), CAPACITY)
	H.eq(r.id, "unlock:" .. zone.Id, "id")
end)

-- --------------------------------------------------------------- tier 5: sell to afford
H.test("selling is suggested exactly when it is what unblocks the purchase", function()
	local price = Config.upgradeCost("pack", 0)
	local rate = Config.Sell.CoinsPerShard
	-- One shard short of affording it.
	local short = Objectives.resolve(graduated(function(p)
		p.coins = 0
		p.shards = 1
	end), CAPACITY)
	H.eq(short.id, "save:coins", "1 shard cannot reach " .. price .. ", so it is still a saving goal")

	--[[ Partly saved, and the pack makes up the difference. This is written with coins on the
		 board rather than shards alone for a reason the first version of this test discovered:
		 at pack level 0 the capacity is 25 and the cheapest upgrade is 50, so a pack
		 holding exactly enough to buy it is also exactly FULL, and tier 2 correctly wins.
		 Those two boundaries coincide only at the very start of the game, and the tier-5 term
		 that actually matters is `coins + shards * rate`, so the fixture exercises that. ]]
	local shards = 4
	local r = Objectives.resolve(graduated(function(p)
		p.coins = price - shards * rate
		p.shards = shards
	end), CAPACITY)
	H.ok(shards < CAPACITY, "the fixture must not be a full pack, or tier 2 answers instead")
	H.eq(r.id, "sell:goal", "carrying enough to complete the purchase flips to SELL")

	-- One shard less and it is still a saving goal, which is the boundary the tier turns on.
	local justShort = Objectives.resolve(graduated(function(p)
		p.coins = price - shards * rate
		p.shards = shards - 1
	end), CAPACITY)
	H.eq(justShort.id, "save:coins", "a sell that would NOT complete the purchase is not the objective")
end)

H.test("with nothing in the pack, selling is never suggested", function()
	local r = Objectives.resolve(graduated(function(p) p.coins = 0 p.shards = 0 end), CAPACITY)
	H.eq(r.id, "save:coins", "got " .. r.id)
end)

-- --------------------------------------------------------------- tier 6: save
H.test("the saving goal draws a real capsule, and it is bounded by the price", function()
	local price = Config.upgradeCost("pack", 0)
	local r = Objectives.resolve(graduated(function(p) p.coins = 7 end), CAPACITY)
	H.eq(r.id, "save:coins", "id")
	H.eq(r.progress, 7, "progress")
	H.eq(r.target, price, "target")

	--[[ The capsule can never read more than its goal, and the reason is STRUCTURAL rather
		 than defensive: tier 4 fires on `coins >= price`, so tier 6 is only ever reached below
		 the price. Asserted as a property over the whole reachable range rather than at one
		 point, because a single rich fixture lands in tier 4 or tier 7 and proves nothing —
		 which is exactly what the first version of this assertion did.

		 The `math.min` in the source is therefore unreachable today and is kept as defence
		 against a reordering. `mutation-check.mjs` records it as an equivalent mutant rather
		 than pretending a test covers it. ]]
	for _, coins in { 0, 1, price - 1 } do
		local r = Objectives.resolve(graduated(function(p) p.coins = coins end), CAPACITY)
		H.eq(r.id, "save:coins", "coins=" .. coins .. " should still be saving")
		H.ok(r.progress <= r.target, "progress " .. r.progress .. " exceeded target " .. r.target)
		H.eq(r.progress, coins, "the capsule shows the coins actually held")
	end
end)

H.test("the price is formatted with separators, because a price is not a count", function()
	H.eq(Objectives.comma(0), "0", "0")
	H.eq(Objectives.comma(999), "999", "999")
	H.eq(Objectives.comma(1000), "1,000", "1000")
	H.eq(Objectives.comma(19835), "19,835", "19835")
	H.eq(Objectives.comma(1234567), "1,234,567", "1234567")
end)

--[[ The width budget, asserted rather than believed.

	 §2 of the design plan set the chip's width from the longest string the resolver can emit,
	 and BOTH reviews that computed the worst-case price got it wrong — the plan said 30,764
	 (an order of magnitude out) and the review that caught the plan said 19,836 (out by one).
	 The real maximum is `floor(100 * 1.8^9)` = 19,835.

	 So the number is computed here from Config rather than quoted, and the character budget
	 the client's layout depends on is pinned. If someone raises a BaseCost or a CostGrowth,
	 this fails before the chip overflows in a screenshot. ]]
H.test("the longest string the resolver can emit stays inside the chip's budget", function()
	local worst = 0
	for _, up in Config.Upgrades do
		local c = Config.upgradeCost(up.Id, up.MaxLevel - 1)
		if c and c > worst then worst = c end
	end
	for _, z in Config.Zones do
		if z.UnlockCost > worst then worst = z.UnlockCost end
	end
	H.eq(worst, 19835, "the most expensive purchasable thing in the game")

	local title = "REACH " .. Objectives.comma(worst) .. " COINS"
	local capsule = Objectives.comma(worst - 1) .. "/" .. Objectives.comma(worst)
	H.eq(#title, 18, "title chars: " .. title)
	H.eq(#capsule, 13, "capsule chars: " .. capsule)

	-- Every other title the ladder can emit must also fit inside that budget.
	for _, z in Config.Zones do
		H.ok(#("EXPLORE " .. z.Name) <= 20, "EXPLORE " .. z.Name)
		H.ok(#("UNLOCK " .. z.Name) <= 20, "UNLOCK " .. z.Name)
	end
	for _, up in Config.Upgrades do
		H.ok(#("BUY " .. up.Name) <= 20, "BUY " .. up.Name)
	end
end)

-- --------------------------------------------------------------- tier 7: nothing left
H.test("owning everything is the ONLY state that empties the slot", function()
	local r = Objectives.resolve(graduated(function(p)
		for _, up in Config.Upgrades do p.upgrades[up.Id] = up.MaxLevel end
		for _, z in Config.Zones do p.zones[z.Id] = true p.visited[z.Id] = true end
		p.shards = 0
	end), CAPACITY)
	H.eq(r.complete, true, "complete")
	H.eq(r.id, "", "id")
	H.eq(r.text, "", "text")
end)

-- --------------------------------------------------------------- stability
--[[ THE PROPERTY, not an example.

	 A resolver that oscillated between two answers would fire a transition ten times a second.
	 This walks a scripted session — collect, fill, sell, buy, unlock, explore — and asserts the
	 id sequence contains no adjacent A → B → A. That is a stronger statement than any single
	 tier assertion, and it is the one that would catch a future tier inserted in the wrong
	 place. ]]
H.test("a whole session produces no A -> B -> A flapping", function()
	local seen: { string } = {}
	local function step(p)
		local id = Objectives.resolve(p, CAPACITY).id
		if seen[#seen] ~= id then
			table.insert(seen, id)
		end
	end

	local p = Profile.new()
	step(p)
	-- onboarding
	p.objectives.collect = Config.Objectives[1].Target
	step(p)
	p.objectives.sell = Config.Objectives[2].Target
	step(p)
	p.objectives.upgrade = Config.Objectives[3].Target
	step(p)
	-- a full pack, then a sell
	p.shards = CAPACITY
	step(p)
	p.shards = 0
	p.coins = CAPACITY * Config.Sell.CoinsPerShard
	step(p)
	-- buy the thing it pointed at
	p.coins = 0
	p.upgrades.pack = 1
	step(p)
	-- save toward the zone, then unlock it
	p.coins = 2500
	step(p)
	p.coins = 0
	p.zones.frost = true
	step(p)
	-- walk there
	p.visited.frost = true
	step(p)

	for i = 3, #seen do
		H.ok(seen[i] ~= seen[i - 2], "flapped: " .. seen[i - 2] .. " -> " .. seen[i - 1] .. " -> " .. seen[i])
	end
	H.ok(#seen >= 6, "the walk should visit several tiers, saw " .. #seen .. ": " .. table.concat(seen, " -> "))
end)

--[[ Totality. `sanitize` is the only legal way to make a profile, but the resolver is called
	 once per push and a nil field arriving from a future refactor must not take the server
	 down mid-session. ]]
H.test("a profile missing every optional field still resolves", function()
	local r = Objectives.resolve({ objectives = {}, zones = {}, upgrades = {} }, 0)
	H.ok(r.id ~= nil and r.text ~= nil, "it returned a record")
	H.eq(r.index, 1, "with nothing recorded, the chain has not started")
end)

H.report("objectives")
