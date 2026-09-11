--!nocheck
--!modules Config=shared/Config,Util=shared/Util,Palette=shared/Palette,CodeTable=server/CodeTable,Profile=server/Profile,Shop=server/Shop
--[[
	Crystal Canyon — the shop's three verbs.

	WHY THIS FILE EXISTS AT ALL. The defect being fixed (V7) was that SHOP and UPGRADES were the
	same panel: same three `Config.Upgrades` entries, same prices, same remote. The fix is only
	real if the shop's products can never become stats again, and if its three verbs behave
	differently from the one verb upgrades has. Both are asserted here rather than described in
	a comment.

	The two verbs that MOVE something get the same scrutiny `Upgrades.purchase` gets, because
	they are currency paths: a refusal must cost nothing, and a grant must be paid for exactly
	once. `Shop.use` gets more, because its ordering is inverted on purpose and an inverted
	order is the kind of thing a later refactor "tidies" back.
]]

local profiles = {}
local spent = {}
local pushes = {}
local sellResult = { true, nil }
local sellCalls = 0

local function ctx()
	return {
		Config = Config,
		Util = Util,
		Remotes = __remotesFolder(),
		Data = {
			get = function(player) return profiles[player] end,
			isReady = function(player) return profiles[player] ~= nil end,
		},
		Economy = {
			spendCoins = function(player, amount)
				table.insert(spent, { player = player, amount = amount })
				local p = profiles[player]
				if not p or (p.coins or 0) < amount then
					return false
				end
				p.coins -= amount
				return true
			end,
			--[[ Records the call and answers whatever the spec set up. The real one is
				 Economy's own cooldown-and-empty-pack check; what matters here is that Shop
				 ASKS it and respects the answer, never that it reimplements the arithmetic. ]]
			sellAnywhere = function(_player)
				sellCalls += 1
				return sellResult[1], sellResult[2]
			end,
			push = function(player)
				table.insert(pushes, player)
			end,
		},
	}
end

--- A player with a fresh profile. No Character, so `applyCharacter` returns early — the trail
--- is Studio's to prove and this runtime has no Instance tree to build one in.
local function player(coins: number?): any
	local p = { Name = "Tester" }
	profiles[p] = Profile.new()
	profiles[p].coins = coins or 0
	return p
end

local function reset()
	table.clear(profiles)
	table.clear(spent)
	table.clear(pushes)
	sellResult = { true, nil }
	sellCalls = 0
	Shop.init(ctx())
end

local FLARE = Config.Shop.Consumables[1]
local TRAIL = Config.Shop.Trails[1]

-- ---------------------------------------------------------------- the rule itself
--[[ ONE AXIS, ONE PANEL — the assertion that makes V7 a test rather than a memory.

	 Not a spelling check. It asserts the STRUCTURAL property: no shop product may carry any of
	 the fields an upgrade uses to be a stat. A "MAGNET SURGE" with a BaseValue and a PerLevel
	 would fail here even if it were named something innocent. ]]
H.test("no shop product is a stat, by structure and not by naming", function()
	local STAT_FIELDS = { "BaseValue", "PerLevel", "MaxLevel", "BaseCost", "CostGrowth" }
	local upgradeIds = {}
	for _, up in Config.Upgrades do
		upgradeIds[up.Id] = true
		upgradeIds[string.lower(up.Name)] = true
	end

	local function audit(list, kind)
		for _, item in list do
			for _, field in STAT_FIELDS do
				H.eq(item[field], nil, `${kind} "${item.Id}" carries the upgrade field ${field}`)
			end
			H.ok(not upgradeIds[item.Id], `${kind} "${item.Id}" shares an id with an upgrade`)
			H.ok(not upgradeIds[string.lower(item.Name)], `${kind} "${item.Name}" shares a name with an upgrade`)
		end
	end
	audit(Config.Shop.Consumables, "consumable")
	audit(Config.Shop.Trails, "trail")
end)

H.test("every shop product is priced, named and drawable", function()
	for _, list in { Config.Shop.Consumables, Config.Shop.Trails } do
		for _, item in list do
			H.ok(type(item.Id) == "string" and item.Id ~= "", "id")
			H.ok(type(item.Name) == "string" and #item.Name > 0 and #item.Name <= 20, `name width: ${item.Name}`)
			H.ok(type(item.Cost) == "number" and item.Cost > 0, `cost: ${item.Id}`)
			H.ok(type(item.Icon) == "string" and item.Icon ~= "", "icon")
			H.ok(type(item.Blurb) == "string" and #item.Blurb > 0, "blurb")
		end
	end
end)

H.test("shopItemById finds both kinds and refuses anything else", function()
	local item, kind = Config.shopItemById(FLARE.Id)
	H.eq(kind, "consumable", "kind")
	H.eq(item.Id, FLARE.Id, "id")

	local trail, tkind = Config.shopItemById(TRAIL.Id)
	H.eq(tkind, "trail", "kind")
	H.eq(trail.Id, TRAIL.Id, "id")

	local none, nkind = Config.shopItemById("magnet")
	H.eq(none, nil, "an UPGRADE id is not a shop item")
	H.eq(nkind, nil, "kind")
end)

-- ---------------------------------------------------------------- buy
H.test("buying a consumable charges exactly once and stocks one", function()
	reset()
	local p = player(FLARE.Cost)
	local ok, reason = Shop.buy(p, FLARE.Id)
	H.ok(ok, "refused: " .. tostring(reason))
	H.eq(profiles[p].stock[FLARE.Id], 1, "stock")
	H.eq(profiles[p].coins, 0, "coins")
	H.eq(#spent, 1, "one charge attempt")
	H.eq(spent[1].amount, FLARE.Cost, "charged the listed price")
	H.eq(#pushes, 1, "pushed once")
end)

H.test("a refused purchase costs nothing and grants nothing", function()
	reset()
	local p = player(FLARE.Cost - 1)
	local ok, reason = Shop.buy(p, FLARE.Id)
	H.ok(not ok, "should refuse")
	H.eq(reason, "NOT ENOUGH COINS", "reason")
	H.eq(profiles[p].stock[FLARE.Id], 0, "stock")
	H.eq(profiles[p].coins, FLARE.Cost - 1, "coins untouched")
	H.eq(#pushes, 0, "no push for a refusal")
end)

H.test("stock is capped, and a full stock is refused before the charge", function()
	reset()
	local p = player(99999)
	for _ = 1, FLARE.MaxStock do
		H.ok(Shop.buy(p, FLARE.Id), "buy within cap")
	end
	H.eq(profiles[p].stock[FLARE.Id], FLARE.MaxStock, "at cap")
	local before = profiles[p].coins
	local ok, reason = Shop.buy(p, FLARE.Id)
	H.ok(not ok, "should refuse at cap")
	H.eq(reason, "ALREADY STOCKED", "reason")
	H.eq(profiles[p].coins, before, "a cap refusal must not charge")
end)

H.test("buying a trail equips it, because an invisible cosmetic reads as a failed purchase", function()
	reset()
	local p = player(TRAIL.Cost)
	H.ok(Shop.buy(p, TRAIL.Id), "buy")
	H.eq(profiles[p].trails[TRAIL.Id], true, "owned")
	H.eq(profiles[p].equipped, TRAIL.Id, "equipped")
end)

H.test("a trail is bought once and cannot be bought twice", function()
	reset()
	local p = player(TRAIL.Cost * 2)
	H.ok(Shop.buy(p, TRAIL.Id), "first")
	local ok, reason = Shop.buy(p, TRAIL.Id)
	H.ok(not ok, "second should refuse")
	H.eq(reason, "ALREADY OWNED", "reason")
	H.eq(profiles[p].coins, TRAIL.Cost, "charged exactly once")
end)

H.test("an UPGRADE id cannot be bought through the shop", function()
	reset()
	local p = player(99999)
	local ok, reason = Shop.buy(p, "magnet")
	H.ok(not ok, "should refuse")
	H.eq(reason, "UNKNOWN ITEM", "reason")
	H.eq(#spent, 0, "and must not reach the wallet")
end)

H.test("a non-string id is refused rather than trusted", function()
	reset()
	local p = player(99999)
	for _, bad in { 42, true, {}, nil } do
		local ok = Shop.buy(p, bad)
		H.ok(not ok, "refused " .. type(bad))
	end
	H.eq(#spent, 0, "no charge from a malformed id")
end)

H.test("a profile that has not loaded grants nothing", function()
	reset()
	local ghost = { Name = "NoProfile" }
	local ok, reason = Shop.buy(ghost, FLARE.Id)
	H.ok(not ok, "should refuse")
	H.eq(reason, "SAVE STILL LOADING", "reason")
end)

-- ---------------------------------------------------------------- use
--[[ THE INVERSION. `Upgrades.purchase` is validate-debit-apply because there the debit is the
	 only thing that can fail. Here the EFFECT is the only thing that can refuse and the charge
	 is the thing with no refund path, so the effect runs first. These two tests are what stop a
	 later refactor "tidying" it back into the house order and burning charges for nothing. ]]
H.test("a refused effect does NOT spend the charge", function()
	reset()
	local p = player(FLARE.Cost)
	H.ok(Shop.buy(p, FLARE.Id), "stock one")
	sellResult = { false, "NOTHING TO SELL" }

	local ok, reason = Shop.use(p, FLARE.Id)
	H.ok(not ok, "should refuse")
	H.eq(reason, "NOTHING TO SELL", "the effect's own reason reaches the player")
	H.eq(profiles[p].stock[FLARE.Id], 1, "THE CHARGE MUST SURVIVE A REFUSED EFFECT")
end)

H.test("a successful effect spends exactly one charge", function()
	reset()
	local p = player(FLARE.Cost * 2)
	H.ok(Shop.buy(p, FLARE.Id), "stock")
	H.ok(Shop.buy(p, FLARE.Id), "stock")
	H.eq(profiles[p].stock[FLARE.Id], 2, "two held")

	H.ok(Shop.use(p, FLARE.Id), "use")
	H.eq(profiles[p].stock[FLARE.Id], 1, "one spent")
	H.eq(sellCalls, 1, "the effect ran once")
end)

H.test("using with none held refuses before the effect runs", function()
	reset()
	local p = player(0)
	local ok, reason = Shop.use(p, FLARE.Id)
	H.ok(not ok, "should refuse")
	H.eq(reason, "NONE LEFT", "reason")
	H.eq(sellCalls, 0, "an empty stock must not reach the effect")
end)

H.test("a TRAIL cannot be used", function()
	reset()
	local p = player(TRAIL.Cost)
	H.ok(Shop.buy(p, TRAIL.Id), "own it")
	local ok, reason = Shop.use(p, TRAIL.Id)
	H.ok(not ok, "should refuse")
	H.eq(reason, "UNKNOWN ITEM", "a cosmetic is not a consumable")
end)

--[[ A consumable that exists in Config and has no effect registered.

	 This is why `EFFECTS` is a table rather than an `if` chain on `item.Id`: a branch would
	 fall through for an unknown id and consume the charge for an effect that never ran. The
	 fixture injects a row into `Config.Shop.Consumables` and removes it again, because the only
	 shipped consumable is deliberately implemented and there is no other way to reach the
	 branch. ]]
H.test("a configured item with no effect refuses instead of eating the charge", function()
	reset()
	local ghost = { Id = "ghost", Name = "GHOST", Blurb = "unimplemented", Icon = "flare", Cost = 10, MaxStock = 3 }
	table.insert(Config.Shop.Consumables, ghost)

	local p = player(ghost.Cost)
	H.ok(Shop.buy(p, ghost.Id), "it can be bought — Config says it exists")
	H.eq(profiles[p].stock[ghost.Id], 1, "stocked")

	local ok, reason = Shop.use(p, ghost.Id)
	H.ok(not ok, "using it must refuse")
	H.eq(reason, "UNKNOWN ITEM", "reason")
	H.eq(profiles[p].stock[ghost.Id], 1, "THE CHARGE MUST SURVIVE an unimplemented effect")

	table.remove(Config.Shop.Consumables, #Config.Shop.Consumables)
end)

--[[ `stockOf` is defence in depth on top of `Profile.sanitize`.

	 Sanitise is the boundary and is tested separately, but a profile is a live table that other
	 server code holds a reference to for the whole session. A value that got past sanitise, or
	 was written after it by a future bug, must not become free charges — the same reasoning
	 `Upgrades.levelOf` gives for re-clamping a level it has already sanitised. ]]
H.test("a corrupt stock value in a LIVE profile cannot mint charges", function()
	reset()
	local p = player(0)
	for _, bad in { 0 / 0, math.huge, 99999, -3, "5", {} } do
		profiles[p].stock[FLARE.Id] = bad
		local ok, reason = Shop.use(p, FLARE.Id)
		H.ok(not ok or sellCalls > 0, "either refused or genuinely ran")
		if bad == math.huge or bad == 99999 then
			-- Clamped to the cap, so it is usable — but never more than the cap.
			H.ok(Shop.use(p, FLARE.Id) ~= nil, "callable")
			H.ok((tonumber(profiles[p].stock[FLARE.Id]) or 0) <= FLARE.MaxStock,
				`${tostring(bad)} left ${tostring(profiles[p].stock[FLARE.Id])} in stock, above the cap`)
		else
			H.eq(reason, "NONE LEFT", `${tostring(bad)} should read as nothing held`)
		end
	end
end)

H.test("a corrupt stock value cannot buy past the cap either", function()
	reset()
	local p = player(99999)
	profiles[p].stock[FLARE.Id] = math.huge
	local ok, reason = Shop.buy(p, FLARE.Id)
	H.ok(not ok, "an infinite stock reads as full, not as empty")
	H.eq(reason, "ALREADY STOCKED", "reason")
	H.eq(profiles[p].coins, 99999, "and must not charge")
end)

-- ---------------------------------------------------------------- equip
H.test("equipping something you do not own is refused", function()
	reset()
	local p = player(0)
	local ok, reason = Shop.equip(p, TRAIL.Id)
	H.ok(not ok, "should refuse")
	H.eq(reason, "YOU DON'T OWN THAT", "reason")
	H.eq(profiles[p].equipped, "", "equipped untouched")
end)

H.test("an owned trail equips, and the empty string unequips", function()
	reset()
	local p = player(TRAIL.Cost)
	H.ok(Shop.buy(p, TRAIL.Id), "buy")
	H.eq(profiles[p].equipped, TRAIL.Id, "equipped on buy")

	H.ok(Shop.equip(p, ""), "unequip")
	H.eq(profiles[p].equipped, "", "nothing equipped")

	H.ok(Shop.equip(p, TRAIL.Id), "re-equip something already owned")
	H.eq(profiles[p].equipped, TRAIL.Id, "equipped again")
end)

H.test("an unknown trail id is refused", function()
	reset()
	local p = player(0)
	local ok, reason = Shop.equip(p, "not-a-trail")
	H.ok(not ok, "should refuse")
	H.eq(reason, "UNKNOWN TRAIL", "reason")
end)

-- ---------------------------------------------------------------- sanitisation
H.test("a corrupt stock value floors to zero, never to the cap", function()
	-- The asymmetry that matters: corruption must not be a route to free charges.
	for _, bad in { 0 / 0, math.huge, -math.huge, -5, "12", {} } do
		local p = Profile.sanitize({ stock = { [FLARE.Id] = bad } })
		H.ok(p.stock[FLARE.Id] >= 0, "never negative")
		H.ok(p.stock[FLARE.Id] < FLARE.MaxStock, `${tostring(bad)} must not become the cap, got ${p.stock[FLARE.Id]}`)
	end
end)

H.test("a stock value above the cap is clamped rather than carried", function()
	local p = Profile.sanitize({ stock = { [FLARE.Id] = 9999 } })
	H.eq(p.stock[FLARE.Id], FLARE.MaxStock, "clamped to the cap")
end)

H.test("equipping in the SAVE is checked against sanitised ownership", function()
	-- A hand-edited save claiming an equipped trail it does not own is not a legal profile.
	local cheat = Profile.sanitize({ equipped = TRAIL.Id, trails = {} })
	H.eq(cheat.equipped, "", "an unowned equip is dropped")

	local legit = Profile.sanitize({ equipped = TRAIL.Id, trails = { [TRAIL.Id] = true } })
	H.eq(legit.equipped, TRAIL.Id, "an owned equip survives")

	local nonsense = Profile.sanitize({ equipped = 42, trails = { [TRAIL.Id] = true } })
	H.eq(nonsense.equipped, "", "a non-string equip is dropped")
end)

H.test("trail ownership accepts only true, not any truthy value", function()
	for _, bad in { 1, "yes", {} } do
		local p = Profile.sanitize({ trails = { [TRAIL.Id] = bad } })
		H.eq(p.trails[TRAIL.Id], false, `${tostring(bad)} must not be ownership`)
	end
end)

H.report("shop")
