--!strict
--[[
	Crystal Canyon — Shop.

	## What this module is for, and what it is deliberately not

	The visual critic's V7 was that two of the four panels were the same panel. SHOP and
	UPGRADES both listed the same three `Config.Upgrades` entries, at the same prices read
	through the same `readUpgrade`, sending the same `Purchase` remote — and `Hud.luau` lit both
	nav badges from one boolean, because there was nothing else the SHOP tile could be about.

	The rule that fixes it lives at the head of `Config.Shop` and is asserted by
	`config.spec.luau`: UPGRADES owns every permanent stat, so the shop sells UTILITY and
	COSMETICS and nothing that moves a number the loop reads. This module is the server half of
	that: three verbs (buy, use, equip) against two nouns upgrades does not have (a stock count,
	an equipped trail).

	## Structure, borrowed on purpose

	Modelled on `Upgrades.luau` — same `Ctx`, same `profileOf`, same bounded character watcher —
	because a service that spends coins and applies something to a character has exactly two
	hard parts and they are both already solved there. What differs is documented where it
	differs, and the differences are the design rather than drift.

	This module never touches `profile.coins`. It asks Economy, which is the only code allowed
	to move currency.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Palette = require(ReplicatedStorage:WaitForChild("CrystalCanyon"):WaitForChild("Palette")) :: any

local Shop = {}

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

local ctx: Ctx = nil :: any

local PROFILE_WAIT_SECONDS = 20

local TRAIL_NAME = "CanyonTrail"
local ATTACH_TOP = "CanyonTrailTop"
local ATTACH_BOTTOM = "CanyonTrailBottom"

-- Internals ---------------------------------------------------------------

local function profileOf(player: Player): ProfileData?
	local data = ctx and ctx.Data
	if not data or not data.isReady(player) then
		return nil
	end
	return data.get(player) :: ProfileData?
end

local function stockOf(profile: ProfileData, item: any): number
	local raw = profile.stock[item.Id]
	if type(raw) ~= "number" or raw ~= raw then
		return 0
	end
	return math.clamp(math.floor(raw), 0, item.MaxStock)
end

--[[ What each consumable actually DOES, as a table rather than an `if` chain.

	 Today there is exactly one, so a branch would be shorter. It is a table anyway for two
	 reasons: a second consumable becomes a row instead of an edit to control flow, and — the
	 one that matters — an item defined in `Config` with no effect registered here is REFUSED
	 rather than silently consumed. A branch would fall through and eat the charge. ]]
local EFFECTS: { [string]: (Player) -> (boolean, string?) } = {
	flare = function(player: Player): (boolean, string?)
		return ctx.Economy.sellAnywhere(player)
	end,
}

-- Character ---------------------------------------------------------------

--[[ Re-apply the equipped trail from the profile. Idempotent, exactly like
	 `Upgrades.applyCharacter`, so the boot script calling it on spawn as well as this module's
	 own respawn watcher costs nothing but a redundant rebuild.

	 The existing trail is destroyed FIRST, unconditionally, so unequipping is the same code
	 path as equipping and cannot grow a second one that forgets a case. A player whose save
	 failed to load gets no trail, which matches "a failed load grants nothing" everywhere else
	 in this codebase.

	 Server-created, so it replicates to everyone: a cosmetic only its owner can see is not a
	 cosmetic. That also means a client that draws itself a local trail fools nobody but itself,
	 which is why an ownership check here is guard enough and no anti-cheat sweep is needed. ]]
function Shop.applyCharacter(player: Player)
	local character = player.Character
	if not character then
		return
	end
	local root = character:FindFirstChild("HumanoidRootPart")
	if not root or not root:IsA("BasePart") then
		return
	end

	local existing = root:FindFirstChild(TRAIL_NAME)
	if existing then
		existing:Destroy()
	end

	local profile = profileOf(player)
	if not profile then
		return
	end
	local equipped = profile.equipped
	if type(equipped) ~= "string" or equipped == "" then
		return
	end
	local def = ctx.Config.trailById(equipped)
	if not def then
		return
	end

	local function attachment(name: string, y: number): Attachment
		local found = root:FindFirstChild(name)
		if found and found:IsA("Attachment") then
			return found
		end
		local made = Instance.new("Attachment")
		made.Name = name
		made.Position = Vector3.new(0, y, 0)
		made.Parent = root
		return made
	end

	local trail = Instance.new("Trail")
	trail.Name = TRAIL_NAME
	trail.Attachment0 = attachment(ATTACH_TOP, 1.4)
	trail.Attachment1 = attachment(ATTACH_BOTTOM, -1.4)
	trail.Color = ColorSequence.new(Palette.lift(def.Color, 0.35), Palette.shade(def.Color, 0.25))
	trail.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 0.15),
		NumberSequenceKeypoint.new(1, 1),
	})
	trail.WidthScale = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1),
		NumberSequenceKeypoint.new(1, 0),
	})
	trail.Lifetime = 0.55
	trail.MinLength = 0.2
	trail.FaceCamera = true
	--[[ §1: saturated, not dimmed by the sun. A trail that takes lighting reads as grey dust
		 in the frost biome, which is the half of the map where it is most visible. ]]
	trail.LightInfluence = 0
	trail.Parent = root
end

--[[ Copied from `Upgrades.onCharacterAdded`, including the post-yield re-check.

	 The first character almost always spawns before the DataStore load returns, so applying
	 once at spawn and never again would leave a player who owns a trail without it for the life
	 of that character. ]]
local function onCharacterAdded(player: Player, character: Model)
	local deadline = os.clock() + PROFILE_WAIT_SECONDS
	while not (ctx.Data and ctx.Data.isReady(player)) and os.clock() < deadline do
		task.wait(0.25)
	end

	-- We yielded, so the player may have died and respawned into a different character, or
	-- left. Applying to a live character we are no longer the handler for would race the
	-- newer thread.
	if player.Character ~= character or character.Parent == nil then
		return
	end

	Shop.applyCharacter(player)
end

local function watch(player: Player)
	player.CharacterAdded:Connect(function(character)
		onCharacterAdded(player, character)
	end)
	if player.Character then
		task.spawn(onCharacterAdded, player, player.Character)
	end
end

-- Public ------------------------------------------------------------------

function Shop.init(context: Ctx)
	ctx = context
	-- Both branches are needed: init may run before anyone has joined (live server) or after
	-- (Studio play solo, where the local player exists by the time server scripts finish).
	for _, player in Players:GetPlayers() do
		watch(player)
	end
	Players.PlayerAdded:Connect(watch)
end

--[[ Buy a consumable charge or a trail.

	 `itemId` is typed `any` on purpose, the same reasoning `Upgrades.purchase` gives: this is a
	 currency path, and a module that only behaves when its caller behaves is one refactor away
	 from being the vulnerability. `Net` validates too; this does not depend on it having.

	 THERE IS NO AFFORDABILITY TEST OF ITS OWN. `spendCoins` is the only test that counts, for
	 the reason `Zones.unlock` already spells out: a separate check re-opens the double-spend
	 window on two events arriving in one frame. ]]
function Shop.buy(player: Player, itemId: any): (boolean, string?)
	if type(itemId) ~= "string" then
		return false, "UNKNOWN ITEM"
	end
	local profile = profileOf(player)
	if not profile then
		return false, "SAVE STILL LOADING"
	end
	local item, kind = ctx.Config.shopItemById(itemId)
	if not item then
		return false, "UNKNOWN ITEM"
	end

	if kind == "consumable" then
		if stockOf(profile, item) >= item.MaxStock then
			return false, "ALREADY STOCKED"
		end
		if not ctx.Economy.spendCoins(player, item.Cost) then
			return false, "NOT ENOUGH COINS"
		end
		profile.stock[item.Id] = stockOf(profile, item) + 1
	else
		if profile.trails[item.Id] == true then
			return false, "ALREADY OWNED"
		end
		if not ctx.Economy.spendCoins(player, item.Cost) then
			return false, "NOT ENOUGH COINS"
		end
		profile.trails[item.Id] = true
		--[[ Buying a trail equips it. A cosmetic you have paid for and cannot see reads as a
			 purchase that failed, and the reward feedback rule everywhere else in this game is
			 that silence reads as breakage. ]]
		profile.equipped = item.Id
		Shop.applyCharacter(player)
	end

	ctx.Economy.push(player)
	return true, nil
end

--[[ Spend a charge.

	 THE ORDER IS INVERTED relative to `Upgrades.purchase`'s validate-debit-apply, and the
	 inversion is the design rather than an oversight.

	 There, the debit was the only thing that could fail and delivery could not, so debiting
	 first was safe. Here the roles are reversed: the EFFECT is the only thing that can refuse
	 (an empty pack, a sell still on cooldown) and the charge is the thing with no refund path.
	 Spending first would burn a flare for nothing, which is the worst outcome available.

	 Neither call yields, so the effect and the decrement are still one uninterrupted run of
	 code — a second UseItem in the same frame cannot observe the un-decremented stock. ]]
function Shop.use(player: Player, itemId: any): (boolean, string?)
	if type(itemId) ~= "string" then
		return false, "UNKNOWN ITEM"
	end
	local profile = profileOf(player)
	if not profile then
		return false, "SAVE STILL LOADING"
	end
	local item, kind = ctx.Config.shopItemById(itemId)
	if not item or kind ~= "consumable" then
		return false, "UNKNOWN ITEM"
	end

	local held = stockOf(profile, item)
	if held <= 0 then
		return false, "NONE LEFT"
	end

	local effect = EFFECTS[item.Id]
	if not effect then
		-- Configured but not implemented. Refusing is the only safe answer: consuming a charge
		-- for an effect that does not exist is a charge stolen by a config edit.
		return false, "UNKNOWN ITEM"
	end

	local ok, reason = effect(player)
	if not ok then
		return false, reason
	end

	profile.stock[item.Id] = held - 1
	ctx.Economy.push(player)
	return true, nil
end

--[[ Equip a trail, or `""` to unequip.

	 Grants nothing and costs nothing, so it needs none of the atomicity discipline the two
	 above do — only the ownership check, which is what stops a client equipping a trail it
	 never bought. ]]
function Shop.equip(player: Player, trailId: any): (boolean, string?)
	if type(trailId) ~= "string" then
		return false, "UNKNOWN TRAIL"
	end
	local profile = profileOf(player)
	if not profile then
		return false, "SAVE STILL LOADING"
	end

	if trailId ~= "" then
		local def = ctx.Config.trailById(trailId)
		if not def then
			return false, "UNKNOWN TRAIL"
		end
		if profile.trails[trailId] ~= true then
			return false, "YOU DON'T OWN THAT"
		end
	end

	profile.equipped = trailId
	Shop.applyCharacter(player)
	ctx.Economy.push(player)
	return true, nil
end

return Shop
