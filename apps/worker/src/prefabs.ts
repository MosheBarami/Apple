// VETTED MODULES — the three systems the agent rewrites every time and gets subtly wrong.
//
// roadmap.ts now tells the model what correct looks like: UpdateAsync rather than SetAsync, refuse
// to save when the load failed, session-lock the profile, ProcessReceipt idempotent on PurchaseId,
// rate-limit on the server rather than debounce on the client. A brief is an instruction, and an
// instruction is re-followed from scratch on every project, with a fresh chance to drop one clause.
// These are the same rules as CODE, written once and installed.
//
// WHY THESE THREE. Each is a system whose failure is silent, delayed, and destroys something the
// player cannot get back: their save, their money, or the integrity of the leaderboard. A wrong
// door opens or does not open and someone notices in a minute. A wrong DataStore write is noticed a
// week later by a player who has lost a month.
//
// WHY THEY SHIP AS SOURCE AND NOT AS A ROBLOX ASSET. A ModuleScript installed through `edit_script`
// is text this repository owns, reviewed here, compiled in CI by luau-analyze, and readable by the
// user in their own place. A model asset would be an id, a licence question, and a black box behind
// the asset gate. The source is the artefact.
//
// WHAT THESE ARE NOT. They are not a framework and they do not call each other. A user who installs
// one gets one file with no dependencies, which is the only shape that survives being dropped into
// a project the agent did not write.

export interface Prefab {
  id: string;
  /** The name the ModuleScript takes, matching the table the source returns and the api strings. */
  moduleName: string;
  /** What the user gets, in the words the tool description will use. */
  summary: string;
  /** The specific failures this exists to prevent. Shown to the model so it knows when to reach. */
  prevents: string[];
  /** Where it belongs. ServerScriptService for anything holding authority. */
  defaultParent: string;
  className: 'ModuleScript' | 'Script' | 'LocalScript';
  /** The public functions, so the model can use it without reading the whole file. */
  api: string[];
  source: string;
}

const PROFILE_SOURCE = `--!strict
-- Profile — player data that survives, written the way DataStores actually behave.
--
-- Four rules, each one a bug that has cost real games real accounts:
--   1. UpdateAsync, never SetAsync. UpdateAsync is a read-modify-write the service serialises, so
--      two servers saving the same player cannot silently overwrite one another.
--   2. If the LOAD failed, this session never saves. Writing a fresh default over a read that
--      errored is how an account is wiped, and on the server it looks exactly like a good save.
--   3. One writable copy per player. A second server takes over only after the lock goes stale.
--   4. BindToClose as well as PlayerRemoving — a shutting-down server does not always fire
--      PlayerRemoving for everyone before it goes.
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Profile = {}

local STORE = DataStoreService:GetDataStore("PlayerProfile_v1")
local RETRIES = 4
local LOCK_STALE_SECONDS = 900

-- Edit this to match your game. Every field a player can earn belongs here.
local DEFAULTS = {
	coins = 0,
	level = 1,
}

local cache = {}

local function keyFor(userId)
	return "u_" .. tostring(userId)
end

local function attempt(fn)
	local lastErr = nil
	for i = 1, RETRIES do
		local ok, res = pcall(fn)
		if ok then
			return true, res
		end
		lastErr = res
		task.wait(0.2 * (2 ^ (i - 1)))
	end
	warn("[Profile] gave up after " .. RETRIES .. " tries: " .. tostring(lastErr))
	return false, nil
end

local function copyDefaults()
	local out = {}
	for k, v in pairs(DEFAULTS) do
		out[k] = v
	end
	return out
end

--- Load a player's profile and take the session lock. Yields.
--- Returns the data table, or nil when the read failed — and nil MUST disable saving.
function Profile.load(player)
	local serverId = game.JobId ~= "" and game.JobId or "studio"
	local ok, data = attempt(function()
		return STORE:UpdateAsync(keyFor(player.UserId), function(stored)
			local now = os.time()
			if stored ~= nil and stored.lock ~= nil then
				local heldBy = stored.lock.serverId
				local heldAt = stored.lock.at or 0
				if heldBy ~= serverId and (now - heldAt) < LOCK_STALE_SECONDS then
					-- Somebody else holds it and the hold is fresh. Refuse rather than duplicate.
					return nil
				end
			end
			local value = stored and stored.value or copyDefaults()
			return { value = value, lock = { serverId = serverId, at = now } }
		end)
	end)

	if not ok or data == nil then
		-- Either the service failed, or another server holds a live lock. Both mean: do not save.
		cache[player.UserId] = nil
		return nil
	end

	cache[player.UserId] = { value = data.value, canSave = true }
	return data.value
end

--- Save and release. Safe to call twice. Yields.
function Profile.release(player)
	local entry = cache[player.UserId]
	cache[player.UserId] = nil
	if entry == nil or not entry.canSave then
		-- The load failed, so there is nothing trustworthy to write. This is the rule.
		return false
	end
	local ok = attempt(function()
		return STORE:UpdateAsync(keyFor(player.UserId), function()
			return { value = entry.value, lock = nil }
		end)
	end)
	return ok
end

--- The live table for a player, or nil when this session may not save them.
function Profile.get(player)
	local entry = cache[player.UserId]
	return entry and entry.value or nil
end

--- Persist a SPECIFIC table for this player now, and adopt it as the session's data on success.
--- Returns true only when the write actually landed.
---
--- This exists for purchases. A receipt must be recorded in the same write that awards the item, so
--- the caller builds one table containing both and hands it here; a false return means nothing was
--- written and the caller must not treat the purchase as done.
function Profile.commit(player, data)
	local entry = cache[player.UserId]
	if entry == nil or not entry.canSave then
		return false
	end
	local ok = attempt(function()
		return STORE:UpdateAsync(keyFor(player.UserId), function(stored)
			local lock = stored and stored.lock or nil
			return { value = data, lock = lock }
		end)
	end)
	if ok then
		entry.value = data
	end
	return ok
end

Players.PlayerRemoving:Connect(function(player)
	Profile.release(player)
end)

game:BindToClose(function()
	if RunService:IsStudio() then
		return
	end
	-- Roblox gives this callback about 30 seconds and then closes the server regardless. Saving in
	-- parallel and WAITING FOR THEM TO FINISH is the documented shape; a fixed sleep is a guess that
	-- silently truncates whichever save happened to be slow, which is the one most worth keeping.
	local outstanding = 0
	for _, player in ipairs(Players:GetPlayers()) do
		outstanding += 1
		task.spawn(function()
			Profile.release(player)
			outstanding -= 1
		end)
	end
	local deadline = os.clock() + 25
	while outstanding > 0 and os.clock() < deadline do
		task.wait(0.1)
	end
	if outstanding > 0 then
		warn("[Profile] shut down with " .. tostring(outstanding) .. " save(s) unfinished")
	end
end)

return Profile
`;

const REMOTE_GUARD_SOURCE = `--!strict
-- RemoteGuard — the server side of every RemoteEvent, in one place.
--
-- A debounce in a LocalScript is not a rate limit. It is a courtesy, and the exploiter deletes it.
-- The limit has to live where the client cannot reach it, which is here.
--
-- It also refuses the shape of request that looks harmless and is not: a correctly typed value the
-- player has no right to send. Type, range and authority are three separate questions.
local RemoteGuard = {}

local buckets = {}

--- Wrap a handler so it is rate-limited and validated before it ever runs.
---   remote     the RemoteEvent to listen on
---   opts.perSecond   how many calls one player may make (default 5)
---   opts.validate    function(player, ...) -> boolean, true when the arguments are acceptable
---   handler    function(player, ...) — runs only when the call survives both gates
function RemoteGuard.on(remote, opts, handler)
	opts = opts or {}
	local perSecond = opts.perSecond or 5
	local validate = opts.validate
	local capacity = math.max(1, perSecond)

	remote.OnServerEvent:Connect(function(player, ...)
		local now = os.clock()
		local bucket = buckets[player]
		if bucket == nil then
			bucket = { tokens = capacity, at = now }
			buckets[player] = bucket
		end

		-- Refill by elapsed time rather than by a timer, so a burst after a quiet period is
		-- allowed and a sustained flood is not.
		bucket.tokens = math.min(capacity, bucket.tokens + (now - bucket.at) * perSecond)
		bucket.at = now
		if bucket.tokens < 1 then
			return
		end
		bucket.tokens = bucket.tokens - 1

		if validate ~= nil then
			local ok, verdict = pcall(validate, player, ...)
			if not ok or verdict ~= true then
				return
			end
		end

		local ran, err = pcall(handler, player, ...)
		if not ran then
			warn("[RemoteGuard] " .. remote.Name .. " handler errored: " .. tostring(err))
		end
	end)
end

--- Forget a player's bucket. Call on PlayerRemoving so the table does not grow forever.
function RemoteGuard.forget(player)
	buckets[player] = nil
end

game:GetService("Players").PlayerRemoving:Connect(RemoteGuard.forget)

return RemoteGuard
`;

const RECEIPTS_SOURCE = `--!strict
-- Receipts — developer product purchases, granted exactly once or not at all.
--
-- THE RULE, from Roblox's own guidance: purchase handling must be ATOMIC. The award and the record
-- that this PurchaseId was handled have to land in the SAME write. Anything else has a window.
--
-- The obvious implementation — mark the receipt, run the handler, mark it delivered — looks careful
-- and is not: if the server dies between the award and the second mark, the retry sees an unfinished
-- record and awards again. The player is charged once and receives twice, and nothing errors.
--
-- So the handler here mutates a COPY of the player's data. The copy carries both the award and the
-- receipt id, and is persisted in one write. Only if that write succeeds does the copy become the
-- live session data and the receipt get consumed. If it fails, the live data is untouched and
-- NotProcessedYet asks Roblox to retry — the player keeps their Robux until it works.
--
-- SETUP (once, in a server Script):
--   local Receipts = require(game.ServerScriptService.Receipts)
--   local Profile = require(game.ServerScriptService.Profile)
--   Receipts.configure({ get = Profile.get, commit = Profile.commit })
--   Receipts.product(123456, function(player, data, receiptInfo)
--     data.coins = (data.coins or 0) + 100
--     return true
--   end)
local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")

local Receipts = {}

local handlers = {}
local getData = nil
local commitData = nil

--- Wire this to your data module. \`get(player)\` returns the live table or nil when the player's
--- data has not loaded; \`commit(player, data)\` persists THAT table and returns true on success.
function Receipts.configure(opts)
	getData = opts.get
	commitData = opts.commit
end

function Receipts.product(productId, grant)
	handlers[productId] = grant
end

local function deepCopy(value)
	if type(value) ~= "table" then
		return value
	end
	local out = {}
	for k, v in pairs(value) do
		out[k] = deepCopy(v)
	end
	return out
end

local function replaceContents(target, source)
	for k in pairs(target) do
		target[k] = nil
	end
	for k, v in pairs(source) do
		target[k] = v
	end
end

MarketplaceService.ProcessReceipt = function(receiptInfo)
	if getData == nil or commitData == nil then
		warn("[Receipts] not configured — call Receipts.configure first")
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
	if player == nil then
		-- Not an error: the player left. Do not consume the receipt; Roblox retries on rejoin.
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local live = getData(player)
	if live == nil then
		-- Their data has not loaded, or loaded badly. Awarding into nothing loses the purchase.
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local handler = handlers[receiptInfo.ProductId]
	if handler == nil then
		warn("[Receipts] no handler for product " .. tostring(receiptInfo.ProductId))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local purchaseId = tostring(receiptInfo.PurchaseId)
	if live.receipts ~= nil and live.receipts[purchaseId] ~= nil then
		-- Already awarded AND already saved. Consume the receipt so Roblox stops retrying.
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end

	-- Everything below happens on a copy, so a failure leaves the session exactly as it was.
	local working = deepCopy(live)
	working.receipts = working.receipts or {}

	local ok, awarded = pcall(handler, player, working, receiptInfo)
	if not ok or awarded ~= true then
		warn("[Receipts] handler declined or errored: " .. tostring(awarded))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	-- The award and the receipt id go into ONE write. This is the whole design.
	working.receipts[purchaseId] = os.time()

	local saved = commitData(player, working)
	if saved ~= true then
		-- Nothing was persisted and nothing was changed in memory. The retry starts clean.
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	replaceContents(live, working)
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

return Receipts
`;

const CURRENCY_SOURCE = `--!strict
-- Currency — the number the loop runs on, with one copy that is true.
--
-- leaderstats is REPLICATED DISPLAY STATE. Roblox built it to put a number above a player's name,
-- and it is writable from anywhere on the server, so the moment two systems both write it they
-- disagree and neither is obviously wrong. The balance that matters is the one in the save.
--
-- So: the profile holds the truth, leaderstats mirrors it, and nothing reads the mirror back. If
-- the mirror is wrong, the mirror is wrong; the player's money is not.
--
-- Everything that moves the number goes through award and spend, which is what makes the rule
-- enforceable rather than a convention. spend REFUSES rather than going negative — a balance that
-- can go below zero is a duplication bug waiting for someone to notice the order of two remotes.
--
-- SETUP (once, in a server Script, after Profile has loaded the player):
--   local Currency = require(game.ServerScriptService.Currency)
--   local Profile = require(game.ServerScriptService.Profile)
--   Currency.configure({ get = Profile.get, name = "Coins", field = "coins" })
--   -- then, once Profile.load(player) has returned non-nil:
--   Currency.attach(player)
local Currency = {}

local getData = nil
local displayName = "Coins"
local fieldName = "coins"

function Currency.configure(opts)
	getData = opts.get
	displayName = opts.name or displayName
	fieldName = opts.field or fieldName
end

local function mirror(player, amount)
	local stats = player:FindFirstChild("leaderstats")
	if stats == nil then
		return
	end
	local value = stats:FindFirstChild(displayName)
	if value ~= nil then
		value.Value = amount
	end
end

--- Build the display mirror. Call only AFTER the player's data has loaded; without data there is
--- no balance to show and a leaderstats of 0 would be a lie about an account we could not read.
function Currency.attach(player)
	if getData == nil then
		warn("[Currency] not configured — call Currency.configure first")
		return false
	end
	local data = getData(player)
	if data == nil then
		return false
	end

	local stats = player:FindFirstChild("leaderstats")
	if stats == nil then
		stats = Instance.new("Folder")
		stats.Name = "leaderstats"
		stats.Parent = player
	end

	local value = stats:FindFirstChild(displayName)
	if value == nil then
		value = Instance.new("IntValue")
		value.Name = displayName
		value.Parent = stats
	end
	value.Value = data[fieldName] or 0
	return true
end

--- The authoritative balance, read from the save and never from leaderstats.
function Currency.balance(player)
	local data = getData and getData(player) or nil
	if data == nil then
		return nil
	end
	return data[fieldName] or 0
end

local function whole(amount)
	return type(amount) == "number" and amount == amount and amount % 1 == 0 and amount >= 0
end

--- Add to the balance. Returns the new balance, or nil when it could not be applied.
function Currency.award(player, amount)
	if not whole(amount) then
		warn("[Currency] award needs a whole, non-negative amount, got " .. tostring(amount))
		return nil
	end
	local data = getData and getData(player) or nil
	if data == nil then
		return nil
	end
	data[fieldName] = (data[fieldName] or 0) + amount
	mirror(player, data[fieldName])
	return data[fieldName]
end

--- Take from the balance. Returns false and changes NOTHING when the player cannot afford it.
function Currency.spend(player, amount)
	if not whole(amount) then
		warn("[Currency] spend needs a whole, non-negative amount, got " .. tostring(amount))
		return false
	end
	local data = getData and getData(player) or nil
	if data == nil then
		return false
	end
	local held = data[fieldName] or 0
	if held < amount then
		return false
	end
	data[fieldName] = held - amount
	mirror(player, data[fieldName])
	return true
end

return Currency
`;

export const PREFABS: Record<string, Prefab> = {
  profile_store: {
    id: 'profile_store',
    moduleName: 'Profile',
    summary: 'Player data that survives leaving, written the way DataStores actually behave.',
    prevents: [
      'two servers saving one player and silently overwriting each other (SetAsync)',
      'a failed load being saved over as a fresh default, which wipes the account and looks like success',
      'the same player joined twice holding two writable copies',
      'a server shutdown losing the session because PlayerRemoving did not fire in time',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'Profile.load(player) -> data | nil   -- nil means DO NOT SAVE this session',
      'Profile.get(player) -> data | nil',
      'Profile.release(player) -> boolean   -- saves and releases the lock',
      'Profile.commit(player, data) -> boolean  -- persist one table now; for atomic purchase writes',
    ],
    source: PROFILE_SOURCE,
  },
  currency: {
    id: 'currency',
    moduleName: 'Currency',
    summary: 'A currency whose true balance lives in the save, with leaderstats as a display mirror.',
    prevents: [
      'leaderstats being treated as the balance, when it is replicated display state anything on the server can write',
      'two systems writing the number and disagreeing, with neither obviously wrong',
      'a balance going negative, which is a duplication bug waiting on the order of two remotes',
      'showing a balance of 0 for a player whose data could not be read',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'Currency.configure({ get = Profile.get, name = "Coins", field = "coins" })',
      'Currency.attach(player) -> boolean   -- after Profile.load returns non-nil',
      'Currency.balance(player) -> number | nil',
      'Currency.award(player, amount) -> number | nil',
      'Currency.spend(player, amount) -> boolean   -- false when they cannot afford it',
    ],
    source: CURRENCY_SOURCE,
  },
  remote_guard: {
    id: 'remote_guard',
    moduleName: 'RemoteGuard',
    summary: 'Server-side rate limiting and validation for every RemoteEvent, in one place.',
    prevents: [
      'a client-side debounce being mistaken for a rate limit',
      'a remote fired in a loop being handled every time',
      'a correctly typed argument the player has no authority to send',
      'a handler error taking down the connection for everyone',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'RemoteGuard.on(remote, { perSecond = 5, validate = f }, handler)',
      'RemoteGuard.forget(player)',
    ],
    source: REMOTE_GUARD_SOURCE,
  },
  receipts: {
    id: 'receipts',
    moduleName: 'Receipts',
    summary: 'Developer product purchases granted exactly once or not at all — the award and the receipt id in one write.',
    prevents: [
      'returning PurchaseGranted before the grant is written, so the player pays and receives nothing',
      'a retried receipt granting the reward a second time, which the obvious mark-then-grant-then-mark implementation still allows',
      'awarding into player data that never loaded',
      'a purchase being consumed while the player is not in the server',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'Receipts.configure({ get = Profile.get, commit = Profile.commit })',
      'Receipts.product(productId, function(player, data, receiptInfo) ... return true end)',
    ],
    source: RECEIPTS_SOURCE,
  },
};

export const PREFAB_IDS = Object.keys(PREFABS);

/** The catalogue, short enough to sit in a tool description. */
export function prefabCatalogue(): { id: string; summary: string; prevents: string[] }[] {
  return PREFAB_IDS.map((id) => ({
    id,
    summary: PREFABS[id]!.summary,
    prevents: PREFABS[id]!.prevents,
  }));
}
