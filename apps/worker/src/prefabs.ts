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

Players.PlayerRemoving:Connect(function(player)
	Profile.release(player)
end)

game:BindToClose(function()
	if RunService:IsStudio() then
		return
	end
	for _, player in ipairs(Players:GetPlayers()) do
		task.spawn(Profile.release, player)
	end
	task.wait(3)
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
-- Receipts — developer product purchases, handled so nobody pays for nothing.
--
-- Two rules, and both of them are about money moving in only one direction:
--   1. Return PurchaseGranted ONLY after the grant is written and the write confirmed. Returning
--      it first tells Roblox to stop retrying, and the player has paid and received nothing.
--   2. Be idempotent on receipt.PurchaseId. Roblox may call this more than once for a single
--      purchase, and a handler that simply adds the reward grants it twice.
local MarketplaceService = game:GetService("MarketplaceService")
local DataStoreService = game:GetService("DataStoreService")

local Receipts = {}

local granted = DataStoreService:GetDataStore("PurchaseReceipts_v1")
local handlers = {}

--- Register what a product gives. grant(player, receiptInfo) must return true only when the
--- reward is durably recorded — if it returns false, Roblox retries later and the player keeps
--- their Robux until it succeeds.
function Receipts.product(productId, grant)
	handlers[productId] = grant
end

MarketplaceService.ProcessReceipt = function(receiptInfo)
	local player = game:GetService("Players"):GetPlayerByUserId(receiptInfo.PlayerId)
	if player == nil then
		-- Not an error: the player left. Do not consume the receipt; Roblox retries on rejoin.
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local handler = handlers[receiptInfo.ProductId]
	if handler == nil then
		warn("[Receipts] no handler for product " .. tostring(receiptInfo.ProductId))
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local receiptKey = "r_" .. tostring(receiptInfo.PurchaseId)

	-- One UpdateAsync does the idempotency check AND the claim, so two concurrent calls for the
	-- same receipt cannot both decide they are first.
	local claimedOk, alreadyGranted = pcall(function()
		return granted:UpdateAsync(receiptKey, function(stored)
			if stored ~= nil then
				return stored
			end
			return { at = os.time(), userId = receiptInfo.PlayerId }
		end)
	end)

	if not claimedOk then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	-- If it was already ours, the reward went out on a previous call. Consume the receipt.
	if alreadyGranted ~= nil and alreadyGranted.delivered == true then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end

	local ok, delivered = pcall(handler, player, receiptInfo)
	if not ok or delivered ~= true then
		-- The grant failed. Release the claim so a retry can try again, and do NOT tell Roblox the
		-- purchase is done.
		pcall(function()
			granted:RemoveAsync(receiptKey)
		end)
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	local markedOk = pcall(function()
		granted:UpdateAsync(receiptKey, function(stored)
			stored = stored or { at = os.time(), userId = receiptInfo.PlayerId }
			stored.delivered = true
			return stored
		end)
	end)
	if not markedOk then
		-- The reward is out but the mark failed. Granting is still correct: the alternative is
		-- charging again on the retry.
		warn("[Receipts] delivered but could not mark " .. receiptKey)
	end

	return Enum.ProductPurchaseDecision.PurchaseGranted
end

return Receipts
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
    ],
    source: PROFILE_SOURCE,
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
    summary: 'Developer product purchases handled so nobody pays for nothing, and nobody is granted twice.',
    prevents: [
      'returning PurchaseGranted before the grant is written, so the player pays and receives nothing',
      'a retried receipt granting the reward a second time',
      'a purchase being consumed while the player is not in the server',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'Receipts.product(productId, function(player, receiptInfo) ... return true end)',
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
