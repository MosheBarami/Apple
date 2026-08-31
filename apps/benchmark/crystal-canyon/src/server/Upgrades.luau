--!strict
--[[
	Crystal Canyon — Upgrades.

	Buying is a three-beat sequence and the order is the whole design: validate,
	debit, apply. Validation can refuse for free. The debit is the single point
	where the purchase becomes real. Everything after it must succeed, because
	the coins are already gone and this game has no refund path.

	This module never touches `profile.coins` — it asks Economy, which is the
	only code allowed to move currency.
]]

local Players = game:GetService("Players")

local Upgrades = {}

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

--[[ How long a freshly spawned character will wait for its profile before
	 stats are applied from whatever is known. Comfortably longer than a normal
	 DataStore load, short enough that a permanently failed load does not leave
	 a thread parked forever. ]]
local PROFILE_WAIT_SECONDS = 20

-- Internals ---------------------------------------------------------------

local function profileOf(player: Player): ProfileData?
	local data = ctx and ctx.Data
	if not data or not data.isReady(player) then
		return nil
	end
	return data.get(player) :: ProfileData?
end

--[[ Profile.sanitize is what guarantees levels are legal, but this is a pricing
	 path: re-clamping here is one comparison and it means a level that somehow
	 slipped out of range charges a real price instead of an extrapolated one. ]]
local function levelOf(profile: ProfileData, up: any): number
	local raw = profile.upgrades[up.Id]
	if type(raw) ~= "number" or raw ~= raw then
		return 0
	end
	return math.clamp(math.floor(raw), 0, up.MaxLevel)
end

--[[ Runs in its own thread per spawn, because it yields.

	 The first character almost always spawns before the DataStore load returns.
	 Applying stats once at spawn and never again would hand a player who bought
	 MOVE SPEED 8 a WalkSpeed of 16 for the rest of the life, so we wait for the
	 profile and only then apply. ]]
local function onCharacterAdded(player: Player, character: Model)
	local humanoid = character:WaitForChild("Humanoid", 10)
	if not humanoid then
		return
	end

	local deadline = os.clock() + PROFILE_WAIT_SECONDS
	while not (ctx.Data and ctx.Data.isReady(player)) and os.clock() < deadline do
		task.wait(0.25)
	end

	--[[ We yielded, so the world may have moved on: the player may have died and
		 respawned into a different character, or left entirely. Applying to a
		 stale character would be harmless but applying to a live one we are no
		 longer the handler for would race the newer thread. ]]
	if player.Character ~= character or character.Parent == nil then
		return
	end

	Upgrades.applyCharacter(player)
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

function Upgrades.init(context: Ctx)
	ctx = context

	--[[ Both branches are needed: init may run before anyone has joined (live
		 server) or after (Studio play solo, where the local player exists by the
		 time server scripts finish). ]]
	for _, player in Players:GetPlayers() do
		watch(player)
	end
	Players.PlayerAdded:Connect(watch)
end

--[[ Re-apply every character-facing stat from the profile. Idempotent by
	 design, so the boot script calling it on spawn as well as this module's own
	 respawn watcher costs nothing but a redundant assignment.

	 With no profile the speed level reads as 0, whose configured value is the
	 Roblox default — so a player whose save failed to load is left exactly where
	 an unmodified character starts and is granted nothing. ]]
function Upgrades.applyCharacter(player: Player)
	local character = player.Character
	if not character then
		return
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return
	end

	local level = 0
	local profile = profileOf(player)
	if profile then
		local up = ctx.Config.upgradeById("speed")
		level = if up then levelOf(profile, up) else 0
	end

	humanoid.WalkSpeed = ctx.Config.upgradeValue("speed", level)
end

--[[ Buy one level of `upgradeId`.

	 `upgradeId` is typed `any` rather than `string` on purpose: Net checks
	 argument types before calling, but this is a currency path, and a module
	 that only behaves when its caller behaves is one refactor away from being
	 the vulnerability. ]]
function Upgrades.purchase(player: Player, upgradeId: any): (boolean, string?)
	if type(upgradeId) ~= "string" then
		return false, "UNKNOWN UPGRADE"
	end

	local profile = profileOf(player)
	if not profile then
		return false, "SAVE STILL LOADING"
	end

	local up = ctx.Config.upgradeById(upgradeId)
	if not up then
		return false, "UNKNOWN UPGRADE"
	end

	local level = levelOf(profile, up)
	--[[ Two max-level checks that look redundant are not: the level comparison
		 is the readable rule, and `upgradeCost` returning nil is Config's own
		 signal for the same thing. Trusting only one of them would let a Config
		 change (a cost curve that stops early, say) charge a nil price. ]]
	if level >= up.MaxLevel then
		return false, "ALREADY MAXED"
	end
	local cost = ctx.Config.upgradeCost(up.Id, level)
	if not cost then
		return false, "ALREADY MAXED"
	end

	--[[ The debit is the commit point. spendCoins checks and subtracts without
		 yielding, so two purchases dispatched in the same frame cannot both pass
		 the balance check — see the comment on Economy.spendCoins. ]]
	if not ctx.Economy.spendCoins(player, cost) then
		return false, "NOT ENOUGH COINS"
	end

	--[[ Past this line nothing may fail, and nothing may yield: the coins are
		 gone and a yield here would let a second purchase interleave between
		 payment and delivery. Every call below is a plain synchronous write. ]]
	profile.upgrades[up.Id] = level + 1

	--[[ Pack capacity only ever grows, so carried shards stay inside the new cap
		 and need no clamp. Magnet is read live by Collect. Speed is the only
		 upgrade with a character-side effect to push. ]]
	Upgrades.applyCharacter(player)

	ctx.Economy.bumpObjective(player, "upgrade", 1)
	ctx.Economy.push(player)
	return true, nil
end

return Upgrades
