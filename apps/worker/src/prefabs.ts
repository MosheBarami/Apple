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

import { APPLE_UI_SOURCE } from './ui-kit';

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
  /**
   * Other modules this one has to be wired to, by id.
   *
   * These are NOT imports — every module is one file with no dependency on the others, which is
   * the only shape that survives being dropped into a project the agent did not write. They are
   * wiring: Receipts is handed Profile's `get` and `commit`, Currency is handed Profile's `get`.
   * Installing one without the other leaves a module that loads, configures, and silently does
   * nothing, which is the failure this field exists to prevent.
   */
  needs?: string[];
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
--   3. One writable copy per player. The lock is REFRESHED while the session runs and re-checked
--      on every write, so a second server takes over only when this one has actually gone.
--   4. BindToClose as well as PlayerRemoving — a shutting-down server does not always fire
--      PlayerRemoving for everyone before it goes.
local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Profile = {}

local STORE = DataStoreService:GetDataStore("PlayerProfile_v1")
local RETRIES = 4

-- How long a lock may go untouched before another server may take it. This is a claim about a
-- server being GONE, so it has to be refreshed while the session is alive — see the heartbeat
-- below. Without that refresh, "stale" would mean "fifteen minutes after they logged in", and a
-- second server would take over a player who is still happily playing on the first.
local LOCK_STALE_SECONDS = 900
local LOCK_REFRESH_SECONDS = 180

local SERVER_ID = game.JobId ~= "" and game.JobId or "studio"

-- Edit this to match your game. Every field a player can earn belongs here.
local DEFAULTS = {
	coins = 0,
	level = 1,
}

local cache = {}
local releaseInFlight = {}

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
	local userId = player.UserId
	if releaseInFlight[userId] ~= nil then
		return nil
	end
	local serverId = SERVER_ID
	local ok, data = attempt(function()
		return STORE:UpdateAsync(keyFor(userId), function(stored)
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
		-- Either the service failed, or another server holds a live lock. Both mean: DO NOT SAVE.
		--
		-- Remembered as an unsaveable session rather than simply forgotten. Clearing the entry would
		-- also work today, because release and commit both refuse a nil entry — but then canSave
		-- would be a flag that is never false, and the rule it names would be enforced by an absence
		-- somewhere else. A later change that caches a failed load for any reason would reintroduce
		-- the account-wiping write with nothing left to stop it. A nil value keeps get() returning
		-- nil, and the flag does the refusing.
		cache[userId] = { value = nil, canSave = false }
		return nil
	end

	cache[userId] = { value = data.value, canSave = true }
	return data.value
end

--- Save and release. Safe to call twice. Yields.
function Profile.release(player)
	local userId = player.UserId
	local entry = cache[userId]
	cache[userId] = nil
	if entry == nil or not entry.canSave then
		-- The load failed, so there is nothing trustworthy to write. This is the rule.
		return false
	end
	releaseInFlight[userId] = entry
	local ok, written = attempt(function()
		return STORE:UpdateAsync(keyFor(userId), function(stored)
			-- THE LOCK IS CHECKED ON THE WAY OUT TOO. Taking it at load is not enough: if this
			-- server stalled long enough for the lock to go stale, another one has legitimately
			-- taken this player over and is writing their live session. Writing ours on top would
			-- replace a real session with a snapshot from before the handover, and clearing the
			-- lock would leave a live session unprotected on top of that.
				-- An absent lock may mean the replacement server already finished and released.
				-- Only positive ownership permits this older snapshot to be saved.
				local lock = stored and stored.lock or nil
				if lock == nil or lock.serverId ~= SERVER_ID then
					return nil
				end
			return { value = entry.value, lock = nil }
		end)
	end)
	if releaseInFlight[userId] == entry then
		releaseInFlight[userId] = nil
	end
	if ok and written == nil then
			warn("[Profile] no longer owns " .. keyFor(userId) .. " — did not save over it")
		return false
	end
	return ok
end

--- The live table for a player, or nil when this session may not save them.
function Profile.get(player)
	local entry = cache[player.UserId]
	-- canSave is checked, not just assumed from value being nil. Those two agreed by accident while
	-- the only way to be unsaveable was a failed load, which also left value nil. A session can now
	-- lose its lock to another server mid-play, and a caller handed the table after that would go on
	-- writing into something that will never be saved, with nothing to tell them.
	if entry == nil or not entry.canSave then
		return nil
	end
	return entry.value
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
	local ok, written = attempt(function()
		return STORE:UpdateAsync(keyFor(player.UserId), function(stored)
			if cache[player.UserId] ~= entry or not entry.canSave then
				return nil
			end
			local lock = stored and stored.lock or nil
			if lock == nil or lock.serverId ~= SERVER_ID then
				-- Not ours any more. Refusing is the only safe answer: the caller checks the
				-- return, and for a purchase a false means the receipt is not consumed.
				return nil
			end
			-- A successful write is proof this session is alive, so it doubles as a lock refresh.
			return { value = data, lock = { serverId = SERVER_ID, at = os.time() } }
		end)
	end)
	if ok and written == nil then
		entry.canSave = false
		warn("[Profile] lost the lock on " .. keyFor(player.UserId) .. " — this session may no longer save")
		return false
	end
	if ok then
		entry.value = data
	end
	return ok
end

--- Push this session's lock timestamp forward for one player. Yields. Returns false when the lock
--- is no longer ours, which also disables saving for that player.
function Profile.refreshLock(userId)
	local entry = cache[userId]
	if entry == nil or not entry.canSave then
		return false
	end
	local ok, written = attempt(function()
		return STORE:UpdateAsync(keyFor(userId), function(stored)
			if stored == nil or stored.lock == nil or stored.lock.serverId ~= SERVER_ID then
				return nil
			end
			stored.lock.at = os.time()
			return stored
		end)
	end)
	if ok and written == nil then
		-- Another server has taken this player. Continuing to save would overwrite a live session
		-- with ours, so this session stops writing — the same refusal a failed load produces.
		entry.canSave = false
		warn("[Profile] lock on " .. keyFor(userId) .. " was taken by another server; saving disabled")
		return false
	end
	return ok
end

--- Touch every live lock this server holds. Yields. Called by the heartbeat below; a test calls it
--- directly, which is the only reason the refresh is checkable without waiting three minutes.
function Profile.refreshAllLocks()
	local ids = {}
	for userId, entry in pairs(cache) do
		if entry.canSave then
			table.insert(ids, userId)
		end
	end
	-- Collected first: refreshLock yields, and mutating cache while iterating it is undefined.
	for _, userId in ipairs(ids) do
		Profile.refreshLock(userId)
	end
end

-- THE HEARTBEAT. A lock records the last moment this server was known to be alive, so it has to be
-- touched while the session runs. Left alone, LOCK_STALE_SECONDS would expire during an ordinary
-- play session and a second server would load the same player — two writable copies, which is
-- exactly what rule 3 exists to prevent.
--
-- The cost is one small write per player per interval, far inside the per-server budget of
-- 60 + 10 per player per minute. It is not an autosave: only the timestamp moves.
--
-- An accumulator on Heartbeat rather than a while-loop, because a loop that nothing can stop is
-- also a loop nothing can test, and the refresh has to be driven deliberately to be checked at all.
-- The work is spawned because a Heartbeat handler must not yield, and DataStore calls do.
local sinceRefresh = 0
RunService.Heartbeat:Connect(function(dt)
	sinceRefresh = sinceRefresh + dt
	if sinceRefresh < LOCK_REFRESH_SECONDS then
		return
	end
	sinceRefresh = 0
	task.spawn(Profile.refreshAllLocks)
end)

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

-- ONE BUCKET PER REMOTE PER PLAYER. A single bucket per player would make every guarded remote
-- share one budget: guard a chat remote at 2/s and a movement remote at 30/s and the player gets
-- whichever limit happened to create the bucket, spent across both — chat spam would throttle
-- movement, and the refill rate applied would depend on which remote fired last. Each call to
-- RemoteGuard.on gets its own table; the registry exists so PlayerRemoving can clear them all.
local bucketTables = {}

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

	local buckets = {}
	table.insert(bucketTables, buckets)

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

--- Forget a player's buckets. Call on PlayerRemoving so the tables do not grow forever.
function RemoteGuard.forget(player)
	for _, buckets in ipairs(bucketTables) do
		buckets[player] = nil
	end
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
-- So the handler here mutates a COPY of the player's data, and the copy carries both the award and
-- the receipt id into ONE write. If that write fails the receipt is not consumed and Roblox retries
-- — the player keeps their Robux until it works.
--
-- THE COPY IS PUT BACK BEFORE THE WRITE, NOT AFTER, and that ordering is load-bearing. The write
-- yields, and during the yield another script can change the same player's data. Putting a snapshot
-- taken before the yield back over the live table after it silently erases whatever happened in
-- between. So the award lands in memory first, the save is a separate snapshot, and the only thing
-- written back afterwards is the receipt mark on its own key.
--
-- A save that fails therefore leaves the award in memory. It is remembered as pending, so the retry
-- saves again instead of awarding again. YOUR HANDLER MUST NOT YIELD — it gets a plain table and
-- should only do arithmetic on it; no DataStore calls, no task.wait, no WaitForChild.
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

-- One receipt at a time per player. Two receipts in flight together each snapshot the session and
-- each save it; whichever save lands second wins, and the loser's award and its receipt mark are
-- gone from disk while the player has already been told the purchase went through.
local inFlight = {}

-- Awards that are in memory but not yet on disk, so a retry after a failed save re-saves instead of
-- re-awarding. Without it the only way to make a retry safe is to undo the grant, and undoing a
-- grant the player can already see is worse than the failure it is cleaning up after.
local pendingSave = {}

Players.PlayerRemoving:Connect(function(player)
	inFlight[player] = nil
	-- A pending award dies with the session, but its receipt was never consumed, so Roblox
	-- re-delivers the purchase when they rejoin and it is awarded then.
	pendingSave[player] = nil
end)

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

	if inFlight[player] then
		-- A receipt for this player is mid-save. Let Roblox retry rather than start a second one.
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	inFlight[player] = true

	local pending = pendingSave[player]
	local awardedAt = pending ~= nil and pending[purchaseId] or nil

	if awardedAt == nil then
		-- The handler runs on a COPY, so an error partway through leaves the session untouched.
		-- No receipts table is put on the copy: the mark belongs to the save snapshot below, and a
		-- handler has no business writing into the receipt log.
		local working = deepCopy(live)

		local ok, granted = pcall(handler, player, working, receiptInfo)
		if not ok or granted ~= true then
			inFlight[player] = nil
			warn("[Receipts] handler declined or errored: " .. tostring(granted))
			return Enum.ProductPurchaseDecision.NotProcessedYet
		end

		-- AND THE COPY GOES BACK RIGHT HERE, BEFORE ANYTHING YIELDS.
		--
		-- This single line used to sit after the save, and that was a way to lose money. The save
		-- yields; during the yield another script can write to the live table -- Currency.award for
		-- this same player is the obvious one, and this library tells you to wire it in. Copying a
		-- snapshot taken BEFORE the yield over the live table AFTER it discards that write, with no
		-- error and nothing logged: the player watches coins they earned disappear.
		--
		-- Nothing can interleave between the handler returning and this line, because neither
		-- yields, so a wholesale copy-back is exactly right here and wrong four lines later. This
		-- does mean YOUR HANDLER MUST NOT YIELD -- no DataStore calls, no task.wait, no
		-- WaitForChild. It is handed a plain table and should only do arithmetic on it.
		replaceContents(live, working)

		awardedAt = os.time()
		pendingSave[player] = pendingSave[player] or {}
		pendingSave[player][purchaseId] = awardedAt
	end

	-- What goes to disk: the session as it stands now, plus the receipt id. The award and the mark
	-- are in ONE write, which is what makes the duplicate check above trustworthy.
	local toSave = deepCopy(live)
	toSave.receipts = toSave.receipts or {}
	toSave.receipts[purchaseId] = awardedAt

	-- commitData yields, and pcall is here because a DataStore error that escapes would leave
	-- inFlight set forever and lock this player out of every future purchase on this server.
	local ok, saved = pcall(commitData, player, toSave)
	inFlight[player] = nil

	if not ok or saved ~= true then
		-- The award is in memory and not on disk, and the receipt is NOT consumed. Roblox retries;
		-- the retry finds it in pendingSave, skips the handler, and saves again.
		warn("[Receipts] save failed for purchase " .. purchaseId .. " — held in memory, will retry")
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end

	-- The mark is the only thing copied back after the yield, and only onto its own key.
	live.receipts = live.receipts or {}
	live.receipts[purchaseId] = awardedAt
	pendingSave[player][purchaseId] = nil
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

const CHECKPOINTS_SOURCE = `--!strict
-- Checkpoints — the obby stage loop, with the three bugs every hand-written one has.
--
--   1. THE STAGE GOES BACKWARDS. Touching stage 3 after reaching stage 7 sets you to 3, because the
--      handler assigns instead of comparing. Players find this instantly and it reads as the game
--      stealing their progress.
--   2. TOUCHED FIRES CONSTANTLY. A part fires Touched many times a second while a character rests
--      on it, and once per limb. Without a per-player guard the save is rewritten dozens of times
--      for one arrival.
--   3. RESPAWN IGNORES THE CHECKPOINT. Roblox respawns at a SpawnLocation of its own choosing
--      unless the character is moved after it loads, so a player who died at stage 9 restarts at
--      the beginning with their stage number still saying 9.
--
-- The furthest stage lives in the player's save, not in leaderstats and not on the character, so it
-- survives a reset, a death and a rejoin.
--
-- SETUP (once, in a server Script, after Profile has loaded the player):
--   local Checkpoints = require(game.ServerScriptService.Checkpoints)
--   local Profile = require(game.ServerScriptService.Profile)
--   Checkpoints.configure({ get = Profile.get, field = "stage", folder = workspace.Checkpoints })
--   Checkpoints.bind(player)   -- after Profile.load(player) returned non-nil
--
-- Checkpoint parts are named by their number: "1", "2", "3"...
local Checkpoints = {}

local getData = nil
local fieldName = "stage"
local folder = nil
local TOUCH_COOLDOWN = 0.5

local lastTouch = {}

function Checkpoints.configure(opts)
	getData = opts.get
	fieldName = opts.field or fieldName
	folder = opts.folder
end

--- The furthest stage this player has reached, or nil when their data is not loaded.
function Checkpoints.stage(player)
	local data = getData and getData(player) or nil
	if data == nil then
		return nil
	end
	return data[fieldName] or 1
end

--- Where a given stage is, or nil when no such checkpoint exists.
function Checkpoints.spawnFor(stage)
	if folder == nil then
		return nil
	end
	return folder:FindFirstChild(tostring(stage))
end

--- Record a stage. Returns true only when this actually advanced the player.
--- NEVER moves the stage backwards: that is bug 1, and a comparison is the whole fix.
function Checkpoints.reach(player, stage)
	if type(stage) ~= "number" or stage % 1 ~= 0 or stage < 1 then
		return false
	end
	local data = getData and getData(player) or nil
	if data == nil then
		return false
	end
	local current = data[fieldName] or 1
	if stage <= current then
		return false
	end
	data[fieldName] = stage
	return true
end

--- Wire a player's touches and respawns. Call after their data has loaded.
function Checkpoints.bind(player)
	if getData == nil or folder == nil then
		warn("[Checkpoints] not configured — call Checkpoints.configure first")
		return false
	end
	if getData(player) == nil then
		return false
	end

	for _, part in ipairs(folder:GetChildren()) do
		local stage = tonumber(part.Name)
		if stage ~= nil then
			part.Touched:Connect(function(hit)
				local character = hit.Parent
				if character == nil or character ~= player.Character then
					return
				end
				-- Bug 2: Touched fires many times a second, and once per limb.
				-- Absence of a previous touch means ALLOW, not "touched at time zero". Defaulting the
				-- timestamp to 0 makes the very first touch compare 0 - 0 against the cooldown and
				-- lose, which swallows a checkpoint reached in the first moments of a server's life.
				local now = os.clock()
				local previous = lastTouch[player]
				if previous ~= nil and now - previous < TOUCH_COOLDOWN then
					return
				end
				lastTouch[player] = now
				Checkpoints.reach(player, stage)
			end)
		end
	end

	-- Bug 3: the character has to be MOVED after it loads; Roblox has already chosen a spawn.
	local function placeAtStage(character)
		local stage = Checkpoints.stage(player)
		if stage == nil then
			return
		end
		local target = Checkpoints.spawnFor(stage)
		if target == nil then
			return
		end
		local root = character:WaitForChild("HumanoidRootPart", 10)
		if root ~= nil then
			root.CFrame = target.CFrame + Vector3.new(0, 4, 0)
		end
	end

	player.CharacterAdded:Connect(placeAtStage)

	-- AND THE CHARACTER THAT IS ALREADY STANDING THERE. Connecting CharacterAdded only handles
	-- deaths from here on; it does nothing about the life the player is already living. By the call
	-- order this module documents -- bind after Profile.load returns -- their character has almost
	-- always spawned already, because CharacterAutoLoads fires on join while Profile.load is still
	-- yielding on a DataStore round trip. So the very case bug 3 describes, a returning player put
	-- back at the start, survived the fix for it: the module only moved them on their SECOND life.
	if player.Character ~= nil then
		task.spawn(placeAtStage, player.Character)
	end

	return true
end

--- Forget a player's touch cooldown. Call on PlayerRemoving.
function Checkpoints.forget(player)
	lastTouch[player] = nil
end

return Checkpoints
`;

const LEADERBOARD_SOURCE = `--!strict
-- Leaderboard — a global top-N, on the scarcest budget Roblox has.
--
-- GetSortedAsync is a LIST operation. Roblox's request limits, per server:
--
--     reads / writes / removes    60 per minute + 40 per player
--     LIST operations              5 per minute +  2 per player
--
-- An order of magnitude less than everything else. So the board is fetched on a TIMER and never on
-- player join: a join-triggered fetch spends the scarcest budget in the API on the most repetitive
-- request in the game, and it does it fastest exactly when the server is filling.
--
-- THE CACHE IS NOT AN OPTIMISATION. A failed fetch must leave the previous board on screen. An
-- empty board does not read as "the service is unavailable" — it reads as "nobody has scored", and
-- a player who sees their own name vanish concludes they lost their progress.
--
-- Writes are per player and go through the same OrderedDataStore, so they are cheap; the read is
-- the expensive one and is shared by everybody.
--
-- SETUP (once, in a server Script):
--   local Leaderboard = require(game.ServerScriptService.Leaderboard)
--   Leaderboard.configure({ store = "Coins_v1", size = 10, refreshSeconds = 60 })
--   Leaderboard.start()
--   -- when a player's score changes, or on leave:
--   Leaderboard.submit(player, Currency.balance(player))
local DataStoreService = game:GetService("DataStoreService")

local Leaderboard = {}

local store = nil
local boardSize = 10
local refreshSeconds = 60
local monotonic = true
local running = false
-- Bumped by every start, so a loop suspended in task.wait that wakes to a restarted module exits
-- instead of running beside the new one. stop() then start() within refreshSeconds would otherwise
-- leave both alive, and each extra loop is another GetSortedAsync against a LIST budget of 5 a
-- minute plus 2 per player -- the one budget this module exists to stay inside.
local generation = 0

-- The last page that successfully loaded. Never cleared by a failure.
local cached = {}
local cachedAt = nil
local failures = 0

function Leaderboard.configure(opts)
	store = DataStoreService:GetOrderedDataStore(opts.store or "Leaderboard_v1")
	boardSize = opts.size or boardSize
	refreshSeconds = opts.refreshSeconds or refreshSeconds
	if opts.monotonic ~= nil then
		monotonic = opts.monotonic
	end
end

--- Record one player's score. Cheap: an ordinary ordered-store write, not a list operation.
--- Scores must be whole numbers; OrderedDataStore stores integers and mangles anything else silently.
---
--- WRITTEN WITH UpdateAsync, NOT SetAsync, AND THAT IS NOT PEDANTRY HERE. Submits are retried, and
--- they arrive from PlayerRemoving and from score changes, so two writes for one player can be in
--- flight with the older one landing second. SetAsync takes the last writer, so a retried stale
--- score would quietly lower somebody's place on the board. The read-modify-write cannot.
---
--- Monotonic by default, because a leaderboard is almost always "best ever" — and because under
--- max() an out-of-order write is not merely survivable, it is a no-op. Set monotonic = false in
--- configure when the board should track a CURRENT value that can legitimately fall, such as a
--- balance that gets spent; then the newest write wins and ordering matters again.
function Leaderboard.submit(player, score)
	if store == nil then
		warn("[Leaderboard] not configured")
		return false
	end
	if type(score) ~= "number" or score % 1 ~= 0 or score < 0 then
		warn("[Leaderboard] score must be a whole, non-negative number, got " .. tostring(score))
		return false
	end
	local ok, err = pcall(function()
		store:UpdateAsync(tostring(player.UserId), function(stored)
			if monotonic and stored ~= nil and stored > score then
				return stored
			end
			return score
		end)
	end)
	if not ok then
		warn("[Leaderboard] submit failed: " .. tostring(err))
	end
	return ok
end

--- Fetch the top N. Returns the entries and whether they are FRESH, so a caller can tell a live
--- board from a cached one instead of guessing.
function Leaderboard.top()
	return cached, cachedAt
end

--- One fetch. Returns true when the board was refreshed. On failure the previous board stands.
function Leaderboard.refresh()
	if store == nil then
		return false
	end
	local ok, pages = pcall(function()
		return store:GetSortedAsync(false, boardSize)
	end)
	if not ok or pages == nil then
		failures = failures + 1
		warn("[Leaderboard] fetch failed (" .. tostring(failures) .. " in a row); keeping the previous board")
		return false
	end

	local okPage, entries = pcall(function()
		return pages:GetCurrentPage()
	end)
	if not okPage or entries == nil then
		failures = failures + 1
		return false
	end

	-- Only replace the cache once a whole page has been read successfully. Building it in place
	-- would leave a half-filled board on screen if the read failed partway.
	local fresh = {}
	for rank, entry in ipairs(entries) do
		fresh[rank] = { userId = tonumber(entry.key), score = entry.value, rank = rank }
	end
	cached = fresh
	cachedAt = os.time()
	failures = 0
	return true
end

--- Start the refresh loop. Idempotent: calling twice does not start two loops, which would double
--- the spend on the one budget this module exists to protect.
function Leaderboard.start()
	if running then
		return false
	end
	running = true
	generation = generation + 1
	local mine = generation
	task.spawn(function()
		while running and generation == mine do
			Leaderboard.refresh()
			task.wait(refreshSeconds)
		end
	end)
	return true
end

function Leaderboard.stop()
	running = false
end

return Leaderboard
`;

const ROUNDS_SOURCE = `--!strict
-- Rounds — the match loop, with the four ways a hand-written one wedges.
--
--   1. TWO LOOPS. Something calls start() again — a second script, a respawn handler, a retry —
--      and now two loops advance the same round, halving every timer and firing every event twice.
--      Nothing errors. It presents as "the game got faster" and is almost impossible to read back
--      from logs.
--   2. THE ROUND THAT NEVER ENDS. The loop waits for a win condition that stops being reachable
--      when the last player leaves, and the server sits in an intermission that never completes
--      until it is shut down.
--   3. STATE THAT SURVIVES A ROUND. Scores, flags and connections from round N are still live in
--      round N+1 because cleanup is a list somebody has to remember to add to.
--   4. JOINING MID-ROUND. A player who arrives at second 40 of a 60-second round is either dropped
--      into a match they cannot win or silently excluded with no explanation.
--
-- The loop here is a state machine with ONE owner, an explicit participant set captured at the
-- start of each round, and a cleanup that runs on every exit path including the failure ones.
--
-- SETUP (once, in a server Script):
--   local Rounds = require(game.ServerScriptService.Rounds)
--   Rounds.configure({ roundSeconds = 120, intermissionSeconds = 15, minimumPlayers = 2 })
--   Rounds.onStart(function(players) --[[ teleport them in, reset scores ]] end)
--   Rounds.onEnd(function(players, reason) --[[ award, announce ]] end)
--   Rounds.start()
local Players = game:GetService("Players")

local Rounds = {}

local roundSeconds = 120
local intermissionSeconds = 15
local minimumPlayers = 2

local running = false
-- Bumped by every start. A loop that wakes to find its generation superseded exits, which a plain
-- running flag cannot manage: stop() then start() inside the same second leaves the old loop asleep
-- in task.wait, and it wakes to a running flag that is true again and keeps ticking beside the new
-- one. Two loops, rounds advancing at double speed, and nothing to point at.
local generation = 0
local phase = "idle"
local participants = {}
local elapsed = 0
local onStart, onEnd = nil, nil
local roundNumber = 0

function Rounds.configure(opts)
	opts = opts or {}
	roundSeconds = opts.roundSeconds or roundSeconds
	intermissionSeconds = opts.intermissionSeconds or intermissionSeconds
	minimumPlayers = opts.minimumPlayers or minimumPlayers
end

function Rounds.onStart(fn) onStart = fn end
function Rounds.onEnd(fn) onEnd = fn end

--- idle | intermission | playing
function Rounds.phase() return phase end
function Rounds.number() return roundNumber end

--- The players captured when the current round began. A player who joins mid-round is NOT in it —
--- they wait for the next one, which is the only answer that is fair and legible.
function Rounds.participants()
	local out = {}
	for _, p in ipairs(participants) do table.insert(out, p) end
	return out
end

local function finish(reason)
	if phase ~= "playing" then
		return false
	end
	local who = Rounds.participants()
	-- Cleanup FIRST, so a handler that errors cannot leave the machine in "playing" forever. This
	-- is rule 3: state is cleared on every exit path, not at the top of the next round.
	phase = "intermission"
	participants = {}
	elapsed = 0
	if onEnd ~= nil then
		local ok, err = pcall(onEnd, who, reason)
		if not ok then
			warn("[Rounds] onEnd errored: " .. tostring(err))
		end
	end
	return true
end

--- End the current round early. Returns false when there was no round to end.
function Rounds.finish(reason)
	return finish(reason or "called")
end

--- Drive the machine forward by dt seconds. The loop calls this; a test can call it directly,
--- which is the only reason a round is testable without waiting two minutes for one.
function Rounds.tick(dt)
	if not running then
		return phase
	end
	elapsed = elapsed + dt

	if phase == "playing" then
		-- Rule 2: a round with nobody in it ends, rather than waiting for a win that cannot happen.
		local present = 0
		for _, p in ipairs(participants) do
			if p.Parent ~= nil then present = present + 1 end
		end
		if present == 0 then
			finish("abandoned")
		elseif elapsed >= roundSeconds then
			finish("time")
		end
		return phase
	end

	-- intermission, or the very first tick
	if elapsed < intermissionSeconds then
		return phase
	end
	local waiting = Players:GetPlayers()
	if #waiting < minimumPlayers then
		-- Not enough players. Stay in intermission rather than starting a match of one, and do not
		-- let elapsed run away, or the next eligible moment starts instantly.
		elapsed = intermissionSeconds
		return phase
	end

	participants = waiting
	elapsed = 0
	phase = "playing"
	roundNumber = roundNumber + 1
	if onStart ~= nil then
		local ok, err = pcall(onStart, Rounds.participants())
		if not ok then
			warn("[Rounds] onStart errored: " .. tostring(err))
			finish("failed to start")
		end
	end
	return phase
end

--- Start the loop. Idempotent: rule 1 is that a second call must not begin a second loop.
function Rounds.start()
	if running then
		return false
	end
	running = true
	generation = generation + 1
	local mine = generation
	phase = "intermission"
	elapsed = 0
	task.spawn(function()
		while running and generation == mine do
			Rounds.tick(1)
			task.wait(1)
		end
	end)
	return true
end

--- Stop cleanly, ending any round in progress so onEnd still runs.
function Rounds.stop()
	if not running then
		return false
	end
	if phase == "playing" then
		finish("stopped")
	end
	running = false
	phase = "idle"
	participants = {}
	elapsed = 0
	return true
end

return Rounds
`;

const TYCOON_SOURCE = `--!strict
-- Income — the dropper-and-collector chain, with the bug that kills the server.
--
-- THE ONE THAT MATTERS: a dropper spawns a part on a timer and nothing ever removes it. Ten
-- droppers at one part a second is 36,000 parts an hour, and the server degrades until it dies.
-- It is not a crash anyone can point at — frame time climbs, players complain the game is laggy,
-- and the cause is a loop working exactly as written. So this caps the live parts per dropper and
-- destroys the oldest when the cap is reached, rather than trusting the collector to keep up.
--
-- Three more, each quieter:
--   * PAYING THE WRONG PLAYER. The collector credits whoever touched it. A visitor standing on a
--     neighbour's collector is then earning their income. Ownership is read from the PLOT, never
--     from the toucher.
--   * TOUCHED FIRES REPEATEDLY. A part resting on the collector pays out dozens of times a second.
--     Each drop is consumed exactly once, by destroying it inside the same guard that credits.
--   * INCOME AFTER LEAVING. A dropper whose owner has gone keeps spawning into a plot nobody owns.
--
-- SETUP (once, in a server Script):
--   local Income = require(game.ServerScriptService.Income)
--   Income.configure({ award = function(player, amount) Currency.award(player, amount) end })
--   Income.addDropper({ plot = plotModel, spawner = dropperPart, value = 5, everySeconds = 2 })
--   Income.collector(plotModel, collectorPart)
--   -- set plot:SetAttribute("OwnerUserId", player.UserId) when a plot is claimed
local Players = game:GetService("Players")

local Income = {}

local MAX_LIVE_PER_DROPPER = 24
local COLLECT_DEBOUNCE = 0.1
-- One drop per two frames is already more than the cap can absorb; below this the period stops
-- being a rate and starts being a way to wedge the thread.
local MIN_DROP_SECONDS = 0.05

local droppers = {}
local awardFn = nil

-- WEAK KEYS, and this one is the module's own headline bug turned on itself. The keys are the drop
-- parts, one per collection, forever — a strong table here grows for the life of the server exactly
-- as the uncapped droppers above would, and holds every destroyed part alive to do it. Weak keys
-- let an entry go the moment nothing else references the part.
local lastCollect = setmetatable({}, { __mode = "k" })

function Income.configure(opts)
	opts = opts or {}
	awardFn = opts.award
	if opts.maxLive ~= nil then
		-- A cap below one is not "no drops", it is a hang: the trim loop below removes the oldest
		-- while the count is at or above the cap, and at zero there is never anything to remove.
		local requested = tonumber(opts.maxLive) or MAX_LIVE_PER_DROPPER
		if requested < 1 then
			warn("[Income] maxLive of " .. tostring(opts.maxLive) .. " is not usable; using 1")
			requested = 1
		end
		MAX_LIVE_PER_DROPPER = math.floor(requested)
	end
end

--- The player who owns a plot, or nil. Read from the PLOT so a visitor cannot be paid by standing
--- somewhere; the attribute is set once when the plot is claimed.
function Income.ownerOf(plot)
	local id = plot:GetAttribute("OwnerUserId")
	if type(id) ~= "number" then
		return nil
	end
	return Players:GetPlayerByUserId(id)
end

--- Register a dropper. Returns a handle with a step(dt) the loop drives.
function Income.addDropper(spec)
	-- A period of zero is not "as fast as possible", it is a thread that never returns: step's
	-- catch-up loop subtracts the period from the accumulator, and subtracting zero never ends.
	-- Lua treats 0 as truthy, so the old "everySeconds or 2" default accepted it. Every other
	-- module here validates its numbers; this one validated nothing.
	local period = tonumber(spec.everySeconds) or 2
	if period < MIN_DROP_SECONDS then
		warn("[Income] everySeconds of " .. tostring(spec.everySeconds) .. " is not usable; using " .. MIN_DROP_SECONDS)
		period = MIN_DROP_SECONDS
	end

	local d = {
		plot = spec.plot,
		spawner = spec.spawner,
		value = spec.value or 1,
		everySeconds = period,
		since = 0,
		live = {},
	}
	table.insert(droppers, d)
	return d
end

--- Spawn one drop from a dropper, capping how many it can have alive at once.
function Income.drop(d)
	-- No owner, no income. A dropper feeding a plot nobody owns is spawning parts for nothing, and
	-- it is the state a plot is in for most of a server's life.
	if Income.ownerOf(d.plot) == nil then
		return nil
	end

	-- THE CAP. Destroy the oldest rather than refusing to spawn: refusing would stall a chain whose
	-- collector is merely slow, and a player watching their dropper stop has no idea why.
	while #d.live >= MAX_LIVE_PER_DROPPER do
		local oldest = table.remove(d.live, 1)
		if oldest == nil then
			-- Nothing left to trim but the condition still holds. Unreachable while the cap is at
			-- least one, and an infinite loop inside the module about not killing the server is not
			-- a thing to leave depending on a check somewhere else.
			break
		end
		if oldest.Parent ~= nil then
			oldest:Destroy()
		end
	end

	local part = Instance.new("Part")
	part.Size = Vector3.new(1, 1, 1)
	part.CFrame = d.spawner.CFrame
	part:SetAttribute("DropValue", d.value)
	part:SetAttribute("DropPlot", d.plot:GetFullName())
	part.Parent = workspace
	table.insert(d.live, part)
	return part
end

--- Advance every dropper by dt seconds. The loop calls this; a test calls it directly.
function Income.step(dt)
	for _, d in ipairs(droppers) do
		d.since = d.since + dt
		-- Bounded as well as validated. The clamp above is what keeps this terminating; the bound is
		-- here because a loop that can freeze a server should not be one assertion away from doing
		-- it, and a dt large enough to owe 200 drops is a stall that dropping more parts cannot fix.
		local owed = 0
		while d.since >= d.everySeconds and owed < 200 do
			d.since = d.since - d.everySeconds
			owed = owed + 1
			Income.drop(d)
		end
		if owed >= 200 then
			d.since = 0
		end
		-- forget parts something else destroyed, so the cap counts what is actually there
		for i = #d.live, 1, -1 do
			if d.live[i].Parent == nil then
				table.remove(d.live, i)
			end
		end
	end
end

--- Wire a collector part. Credits the PLOT'S owner, once per drop.
function Income.collector(plot, part)
	part.Touched:Connect(function(hit)
		local value = hit:GetAttribute("DropValue")
		if value == nil then
			return
		end
		-- One payout per drop: consuming it here is what makes a Touched storm harmless, because
		-- the second event finds a part with no attribute and no parent.
		if hit.Parent == nil then
			return
		end

		-- THE DROP HAS TO BELONG TO THIS PLOT. Every drop is stamped with the plot that made it, and
		-- until now nothing read the stamp: the collector paid the owner of ITS OWN plot, whatever
		-- had touched it. Drops are unanchored parts dropped into workspace and tycoon plots sit
		-- side by side, so one rolling off a conveyor onto the neighbour's collector paid the
		-- neighbour for it. That is this module's own second stated bug -- paying the wrong player --
		-- in the one direction it did not close, with the evidence already written on the part.
		local from = hit:GetAttribute("DropPlot")
		if from ~= nil and from ~= plot:GetFullName() then
			-- Somebody else's income. Leave it alone rather than consuming it: destroying it here
			-- would take the drop away from the plot that is owed it.
			return
		end
		local now = os.clock()
		local previous = lastCollect[hit]
		if previous ~= nil and now - previous < COLLECT_DEBOUNCE then
			return
		end
		lastCollect[hit] = now

		local owner = Income.ownerOf(plot)
		hit:Destroy()
		if owner == nil or awardFn == nil then
			return
		end
		local ok, err = pcall(awardFn, owner, value)
		if not ok then
			warn("[Income] award failed: " .. tostring(err))
		end
	end)
end

--- How many drops a dropper currently has alive. For tests and for a HUD.
function Income.liveCount(d)
	local n = 0
	for _, part in ipairs(d.live) do
		if part.Parent ~= nil then n = n + 1 end
	end
	return n
end

return Income
`;

const BUY_BUTTONS_SOURCE = `--!strict
-- BuyButtons — the tycoon purchase pad, where the money is taken and the thing appears.
--
-- This is the moment a tycoon is most often broken, and every way of breaking it is quiet.
--
-- THE ONE THAT COSTS MONEY: a player pays and gets nothing. The obvious shape is
--   if Currency.spend(player, price) then unlock() end
-- and it looks atomic because both lines are right there. It is not, if unlocking writes anywhere
-- that can fail or yield between the two. Here the deduction and the ownership record go into the
-- SAME live profile table with nothing yielding in between, so the next save writes both or
-- neither. That is the whole reason this module takes Currency.spend and Profile.get rather than
-- doing its own arithmetic: Currency.spend mutates the live table and does not touch a DataStore,
-- which is exactly what makes the pair atomic.
--
-- Three more, each quieter:
--   * TOUCHED FIRES REPEATEDLY, and per limb. A player standing on a pad buys it dozens of times a
--     second. The ownership check catches the second purchase, but the debounce is what stops the
--     first burst racing itself.
--   * PAYING FOR THE NEIGHBOUR'S PLOT. The pad credits whoever touched it, so a visitor standing on
--     a stranger's pad buys THEIR upgrade with the visitor's money. Ownership is read from the
--     PLOT, never from the toucher — the same rule Income follows for the same reason.
--   * A REJOINING PLAYER'S PURCHASES VANISH. The save holds what they bought; the place does not.
--     Nothing re-applies it unless something is asked to, and bind-time restore is the case
--     Checkpoints got wrong too: the work has to happen for the session that is already running,
--     not only for the next event.
--
-- SETUP (once, in a server Script, after Profile.load has returned for the player):
--   local BuyButtons = require(game.ServerScriptService.BuyButtons)
--   BuyButtons.configure({ get = Profile.get, spend = Currency.spend })
--   BuyButtons.add({ plot = plot, button = pad, id = "dropper2", price = 250, unlocks = dropperModel })
--   BuyButtons.restore(player)   -- puts back everything this player already owns
local Players = game:GetService("Players")

local BuyButtons = {}

local getData = nil
local spendFn = nil
local fieldName = "owned"
local TOUCH_DEBOUNCE = 0.5

local buttons = {}
-- Weak keys: one entry per player per pad, and a strong table here would hold departed players and
-- destroyed pads alive for the life of the server. Income shipped that leak; this does not.
local lastTouch = setmetatable({}, { __mode = "k" })

--- Wire this to your data and currency modules.
---   opts.get    function(player) -> the live profile table, or nil when it may not be written
---   opts.spend  function(player, amount) -> true when it was taken, false when unaffordable
---   opts.field  where the owned-ids table lives in the profile (default "owned")
function BuyButtons.configure(opts)
	opts = opts or {}
	getData = opts.get
	spendFn = opts.spend
	if type(opts.field) == "string" and #opts.field > 0 then
		fieldName = opts.field
	end
end

--- What this player owns, as a table of id -> true. Never nil for a loaded player, so callers do
--- not each invent their own empty case.
function BuyButtons.owned(player)
	local data = getData and getData(player) or nil
	if data == nil then
		return nil
	end
	if type(data[fieldName]) ~= "table" then
		data[fieldName] = {}
	end
	return data[fieldName]
end

--- The player who owns a plot, or nil. Read from the PLOT so a visitor cannot buy on it.
local function ownerOf(plot)
	local id = plot:GetAttribute("OwnerUserId")
	if type(id) ~= "number" then
		return nil
	end
	return Players:GetPlayerByUserId(id)
end

-- Named for what it means. It was show(spec, visible), and the flag was read as "is the pad
-- visible" in one place and "is it bought" in another, so registration passed it backwards and
-- every unlockable started ON SCREEN — the exact free-upgrades bug this is supposed to prevent.
-- A boolean whose name does not say which way round it goes is worth renaming rather than
-- remembering.
local function setBought(spec, bought)
	if spec.unlocks ~= nil then
		spec.unlocks.Parent = if bought then spec.parent else nil
	end
	if spec.button ~= nil then
		-- The pad goes away once bought. A pad that stays is a pad that gets stood on again, and
		-- every later touch is a refused purchase the player has to work out for themselves.
		spec.button.Transparency = if bought then 1 else spec.buttonTransparency
		spec.button.CanTouch = not bought
	end
end

--- Register one pad. Returns the spec, so a test or a HUD can read it.
function BuyButtons.add(spec)
	if spec.unlocks == nil then
		-- Refusing here is the point: a pad wired to nothing takes the money and shows no thing.
		warn("[BuyButtons] " .. tostring(spec.id) .. " unlocks nothing; not registering it")
		return nil
	end
	local entry = {
		id = tostring(spec.id),
		plot = spec.plot,
		button = spec.button,
		price = math.max(0, math.floor(tonumber(spec.price) or 0)),
		unlocks = spec.unlocks,
		-- Where the unlocked thing lives when it is visible, captured BEFORE it is taken away.
		parent = spec.unlocks.Parent,
		buttonTransparency = spec.button ~= nil and spec.button.Transparency or 0,
	}
	table.insert(buttons, entry)

	-- Everything starts UNBOUGHT. A place saved with the upgrades already built would otherwise hand
	-- them to every player for free, which is the failure nobody notices until it is monetised.
	setBought(entry, false)

	if entry.button ~= nil then
		entry.button.Touched:Connect(function(hit)
			local character = hit.Parent
			if character == nil then
				return
			end
			local player = Players:GetPlayerFromCharacter(character)
			if player == nil then
				return
			end
			BuyButtons.tryBuy(player, entry)
		end)
	end
	return entry
end

--- Attempt one purchase. Returns "bought", or a reason it did not happen.
function BuyButtons.tryBuy(player, entry)
	if getData == nil or spendFn == nil then
		warn("[BuyButtons] not configured — call BuyButtons.configure first")
		return "unconfigured"
	end

	-- THE PLOT DECIDES, NOT THE TOUCHER. A visitor standing on somebody else's pad is not a buyer.
	if entry.plot ~= nil and ownerOf(entry.plot) ~= player then
		return "not your plot"
	end

	local owned = BuyButtons.owned(player)
	if owned == nil then
		-- Their data did not load. Taking money from a table that may not be saved is how a player
		-- pays and then finds the purchase gone.
		return "no data"
	end
	if owned[entry.id] then
		return "already owned"
	end

	-- THIS IS NOT WHAT STOPS A TOUCHED STORM. The ownership check above already does that, because
	-- the record below is written with nothing yielding in between — removing this guard broke no
	-- test, which is how it was found claiming credit for work it does not do.
	--
	-- It is here for the window a USER can open: spend is documented as non-yielding and
	-- Currency.spend does not yield, but a game wiring its own spend that writes to a DataStore
	-- lets two touches both pass the ownership check before either records anything. That case is
	-- tested; this comment exists so the next person does not assume a broader guarantee.
	local key = tostring(player.UserId) .. ":" .. entry.id
	local now = os.clock()
	local previous = lastTouch[key]
	if previous ~= nil and now - previous < TOUCH_DEBOUNCE then
		return "too soon"
	end
	lastTouch[key] = now

	if not spendFn(player, entry.price) then
		return "cannot afford"
	end

	-- NOTHING YIELDS BETWEEN THE DEDUCTION AND THIS LINE, and that is what makes the pair atomic.
	-- Both live in the same profile table, so the next save writes both or neither. Put a DataStore
	-- call, a wait, or a remote between them and you have rebuilt the bug this module exists to
	-- avoid: paid, and nothing to show for it.
	owned[entry.id] = true
	setBought(entry, true)
	return "bought"
end

--- Put back everything this player already owns. Call after their data has loaded.
---
--- The place does not remember purchases; the save does. Without this a returning player walks into
--- a plot stripped back to its first day, with the pads they already paid for asking again.
function BuyButtons.restore(player)
	local owned = BuyButtons.owned(player)
	if owned == nil then
		return 0
	end
	local restored = 0
	for _, entry in ipairs(buttons) do
		if owned[entry.id] and (entry.plot == nil or ownerOf(entry.plot) == player) then
			setBought(entry, true)
			restored += 1
		end
	end
	return restored
end

--- How many pads are registered. For tests and for a HUD.
function BuyButtons.count()
	return #buttons
end

return BuyButtons
`;

const DAILY_REWARD_SOURCE = `--!strict
-- DailyReward — a bonus on the first join of a day, and a streak that is right about what a day is.
--
-- Every way this breaks is arithmetic, and none of it errors.
--
-- 1. WHAT DAY IS IT. Read from os.time() on the SERVER, never from the client: a device clock is a
--    setting the player can change, and a date taken from it turns a daily reward into an unlimited
--    one. And it is a UTC DAY INDEX, not os.date("*t").yday and not "86400 seconds since last
--    time". yday resets at new year, so 31 December to 1 January reads as a 364-day gap and wipes
--    a year-long streak. Elapsed-seconds is worse: it makes 23:59 and 00:01 "not a new day" while
--    making 09:00 and 09:00 the next morning "two days", so the streak depends on the hour a
--    player happens to log in.
--
-- 2. CLAIMED TWICE. A rejoin, a second server, a double-fired UI button. The claim is keyed on the
--    day index already stored, so a repeat is refused by comparison rather than by a debounce.
--
-- 3. THE AWARD AND THE RECORD ARE ONE WRITE. Awarding and then storing "claimed today" as two
--    steps is a player who claims, the server drops, and they claim again tomorrow for both. Both
--    land in the same live profile table with nothing yielding between them, so the next save
--    writes both or neither. This is the same rule Receipts and BuyButtons follow, for the same
--    reason.
--
-- 4. A STREAK LONGER THAN THE REWARD TABLE. rewards[8] on a five-day table is nil, and nil
--    reaches Currency.award as an amount. The last entry repeats instead.
--
-- SETUP (once, in a server Script, after Profile.load has returned):
--   local DailyReward = require(game.ServerScriptService.DailyReward)
--   DailyReward.configure({ get = Profile.get, award = Currency.award, rewards = { 50, 75, 100, 150, 250 } })
--   local result = DailyReward.claim(player)
--   if result.granted then  -- tell them, show the streak
--   end
local DailyReward = {}

local getData = nil
local awardFn = nil
local fieldName = "daily"
local rewards = { 50, 75, 100, 150, 250 }

--- Wire this to your data and currency modules.
---   opts.get      function(player) -> the live profile table, or nil when it may not be written
---   opts.award    function(player, amount) -> the new balance, or nil when it could not be applied
---   opts.rewards  what day 1, 2, 3... are worth. The last entry repeats for longer streaks.
---   opts.field    where the record lives in the profile (default "daily")
function DailyReward.configure(opts)
	opts = opts or {}
	getData = opts.get
	awardFn = opts.award
	if type(opts.field) == "string" and #opts.field > 0 then
		fieldName = opts.field
	end
	if type(opts.rewards) == "table" and #opts.rewards > 0 then
		rewards = opts.rewards
	end
end

--- The UTC day this instant falls in, as a whole number that counts up forever.
---
--- Subtraction across it is the whole point: day N and day N+1 are consecutive in January and in
--- December alike, because there are no months in it. A calendar date would need to know which,
--- and getting that wrong is invisible until the turn of a year.
function DailyReward.dayIndex(atSeconds)
	return math.floor((atSeconds or os.time()) / 86400)
end

--- What this player's record looks like. Never nil for a loaded player.
local function record(player)
	local data = getData and getData(player) or nil
	if data == nil then
		return nil, nil
	end
	if type(data[fieldName]) ~= "table" then
		data[fieldName] = { lastDay = nil, streak = 0 }
	end
	return data[fieldName], data
end

--- What day N of a streak is worth. A streak past the end of the table repeats the last entry
--- rather than reading nil, which would reach award() as the amount.
function DailyReward.rewardFor(streak)
	if streak < 1 then
		return rewards[1]
	end
	return rewards[math.min(streak, #rewards)]
end

--- Can this player claim, and what would it be worth? Reads nothing and changes nothing.
function DailyReward.status(player, atSeconds)
	local rec = record(player)
	if rec == nil then
		return nil
	end
	local today = DailyReward.dayIndex(atSeconds)
	local last = rec.lastDay
	local streak = rec.streak or 0
	local nextStreak = 1
	if last ~= nil and today - last == 1 then
		nextStreak = streak + 1
	end
	return {
		claimable = last == nil or today > last,
		streak = streak,
		day = today,
		wouldGrant = DailyReward.rewardFor(nextStreak),
		wouldBeStreak = nextStreak,
	}
end

--- Claim today's reward. Returns a table describing what happened; granted is nil when nothing was.
function DailyReward.claim(player, atSeconds)
	if getData == nil or awardFn == nil then
		warn("[DailyReward] not configured — call DailyReward.configure first")
		return { reason = "unconfigured" }
	end

	local rec = record(player)
	if rec == nil then
		-- Their data did not load. Awarding into a table that may not be saved is how a player is
		-- given a bonus and then finds it gone, with the claim recorded against them or not at all.
		return { reason = "no data" }
	end

	local today = DailyReward.dayIndex(atSeconds)
	local last = rec.lastDay

	if last ~= nil and today <= last then
		-- Already claimed. Also catches a clock that went BACKWARDS: an earlier day than the one on
		-- record is not a new day, it is a wrong one, and paying out on it is the exploit.
		return { reason = "already claimed", streak = rec.streak or 0, nextIn = (last + 1) - today }
	end

	-- Exactly yesterday continues the streak. Anything older starts again at one; the gap could be
	-- two days or two months and the answer is the same.
	local streak = 1
	if last ~= nil and today - last == 1 then
		streak = (rec.streak or 0) + 1
	end

	local amount = DailyReward.rewardFor(streak)
	local balance = awardFn(player, amount)
	if balance == nil then
		-- The award did not apply, so nothing is recorded. Recording a claim that was never paid
		-- costs the player a day.
		return { reason = "award failed" }
	end

	-- NOTHING YIELDS BETWEEN THE AWARD AND THESE TWO LINES. Both sit in the same profile table, so
	-- the next save writes the money and the claim together or writes neither.
	rec.lastDay = today
	rec.streak = streak

	return { granted = amount, streak = streak, day = today, balance = balance }
end

--- Forget nothing — there is no per-session state here on purpose.
---
--- Everything this module knows lives in the player's save, so a rejoin, a second server and a
--- restart all read the same answer. A module that remembered anything in memory would be a module
--- that disagrees with itself across servers.
function DailyReward.rewardTable()
	local out = {}
	for i, v in ipairs(rewards) do
		out[i] = v
	end
	return out
end

return DailyReward
`;

const COLLECTIBLES_SOURCE = `--!strict
-- Collectibles — touch to collect, score it, bring it back.
--
-- The first game most creators ask for, and the one Apple got wrong three times in a row on
-- 2026-09-22 (runs 76b59615, fad0ab1b, a95f86fa). Each failure was silent in a playtest with no player:
--
--   * The coins were found by PART name ("coin") when the name was on the MODEL (Coin1..Coin8) and
--     the parts were called Body and Face — "[CoinService] managing 0 coins".
--   * A coin was hidden with model.Transparency = 1. A Model has no Transparency, so the Touched
--     handler errored after awarding the point and before hiding anything.
--   * The Coins stat lived in another script that died on its first line, so no player ever had one.
--
-- So this module finds what you GIVE it (a Model or a part, or every child of a folder whose name
-- matches), hides and restores every part inside it (remembering each part's own transparency),
-- creates the stat itself unless you hand it an award function, and awards once per collection no
-- matter how many limbs touch.
--
-- SETUP (once, in a server Script):
--   local Collectibles = require(game.ServerScriptService.Collectibles)
--   Collectibles.configure({ stat = "Coins", value = 1, respawnSeconds = 10, spinDegreesPerSecond = 90 })
--   Collectibles.addNamed(workspace, "^Coin")   -- every child of Workspace named Coin...
--   Collectibles.start()
--   -- to route points through a saved currency instead of leaderstats:
--   -- Collectibles.configure({ award = function(player, amount) Currency.award(player, amount) end })

local Collectibles = {}

local config: any = {
	stat = "Coins",
	value = 1,
	respawnSeconds = 10,
	spinDegreesPerSecond = 0,
	award = nil,
	-- Injectable so the logic can run outside Studio; defaults are read when first needed.
	players = nil,
	delay = nil,
	newInstance = nil,
}

local items: { [any]: any } = {}
local order: { any } = {}
local started = false

function Collectibles.configure(options: any)
	for key, value in options do
		if config[key] == nil and key ~= "award" and key ~= "players" and key ~= "delay" and key ~= "newInstance" then
			error("Collectibles.configure: unknown option " .. tostring(key), 2)
		end
		config[key] = value
	end
	if type(config.value) ~= "number" or config.value <= 0 or config.value % 1 ~= 0 then
		error("Collectibles.configure: value must be a positive whole number", 2)
	end
	if type(config.respawnSeconds) ~= "number" or config.respawnSeconds < 0 then
		error("Collectibles.configure: respawnSeconds must be zero or more", 2)
	end
end

local function playersService(): any
	if config.players == nil then config.players = game:GetService("Players") end
	return config.players
end

local function later(seconds: number, fn: () -> ())
	if config.delay then config.delay(seconds, fn) else task.delay(seconds, fn) end
end

local function make(className: string): any
	if config.newInstance then return config.newInstance(className) end
	return Instance.new(className)
end

local function partsOf(root: any): { any }
	if root:IsA("BasePart") then return { root } end
	local out = {}
	for _, descendant in root:GetDescendants() do
		if descendant:IsA("BasePart") then table.insert(out, descendant) end
	end
	return out
end

-- An accessory or a tool is nested inside the character, so climb until a player owns the model.
local function playerFrom(hit: any): any
	local players = playersService()
	local node = hit
	while node ~= nil do
		local player = players:GetPlayerFromCharacter(node)
		if player then return player end
		node = node.Parent
	end
	return nil
end

local function statFor(player: any): any
	local folder = player:FindFirstChild("leaderstats")
	if not folder then
		folder = make("Folder")
		folder.Name = "leaderstats"
		folder.Parent = player
	end
	local value = folder:FindFirstChild(config.stat)
	if not value then
		value = make("IntValue")
		value.Name = config.stat
		value.Value = 0
		value.Parent = folder
	end
	return value
end

local function award(player: any)
	if config.award then
		config.award(player, config.value)
	else
		local stat = statFor(player)
		stat.Value += config.value
	end
end

-- Collect root for player. True when it counted; false when it was already hidden or unknown.
function Collectibles.collect(root: any, player: any): boolean
	local state = items[root]
	if not state or state.hidden then return false end
	state.hidden = true
	local saved = {}
	for _, part in state.parts do
		saved[part] = { transparency = part.Transparency, canTouch = part.CanTouch }
		part.Transparency = 1
		part.CanTouch = false
	end
	award(player)
	later(config.respawnSeconds, function()
		for part, was in saved do
			part.Transparency = was.transparency
			part.CanTouch = was.canTouch
		end
		state.hidden = false
	end)
	return true
end

function Collectibles.add(root: any): boolean
	if items[root] then return false end
	local parts = partsOf(root)
	if #parts == 0 then
		warn("Collectibles.add: " .. tostring(root) .. " has no parts to touch; it was not added")
		return false
	end
	local state = { parts = parts, hidden = false }
	items[root] = state
	table.insert(order, root)
	for _, part in parts do
		part.Touched:Connect(function(hit)
			local player = playerFrom(hit)
			if player then Collectibles.collect(root, player) end
		end)
	end
	return true
end

-- Every direct child of parent whose NAME matches pattern (a Lua pattern, e.g. "^Coin").
function Collectibles.addNamed(parent: any, pattern: string): number
	local added = 0
	for _, child in parent:GetChildren() do
		if string.find(child.Name, pattern) and Collectibles.add(child) then added += 1 end
	end
	if added == 0 then
		warn("Collectibles.addNamed: nothing under " .. tostring(parent) .. " is named like " .. pattern)
	end
	return added
end

function Collectibles.count(): number
	return #order
end

function Collectibles.isHidden(root: any): boolean
	local state = items[root]
	return state ~= nil and state.hidden
end

-- Spins visible collectibles. The loop calls this; call it directly to test.
function Collectibles.step(dt: number)
	if config.spinDegreesPerSecond == 0 then return end
	local turn = CFrame.Angles(0, math.rad(config.spinDegreesPerSecond * dt), 0)
	for _, root in order do
		if not items[root].hidden then
			if root:IsA("Model") then root:PivotTo(root:GetPivot() * turn) else root.CFrame = root.CFrame * turn end
		end
	end
end

function Collectibles.start(): boolean
	if started then return false end
	started = true
	if not config.award then
		local players = playersService()
		players.PlayerAdded:Connect(statFor)
		for _, player in players:GetPlayers() do statFor(player) end
	end
	if config.spinDegreesPerSecond ~= 0 then
		game:GetService("RunService").Heartbeat:Connect(Collectibles.step)
	end
	print(("[Collectibles] managing %d"):format(#order))
	return true
end

return Collectibles
`;

export const PREFABS: Record<string, Prefab> = {
  ui_kit: {
    id: 'ui_kit',
    moduleName: 'AppleUI',
    summary: 'Genre-aware client HUD, responsive card/row shop, scrolling objectives and bounded timed notifications. Ten explicit game presentation profiles plus a neutral profile; resize-aware grids, procedural item glyphs, optional descriptions/badges and server-reported owned state. Safe-area layout, touch/gamepad buttons, pending/error feedback and cleanup. Presentation only: authoritative data and purchases belong on the server; inspect actual engine pixels separately.',
    prevents: [
      'client UI granting purchases or changing the authoritative balance instead of waiting for the server',
      'double activation while a request is pending, stale callbacks after destruction and duplicate screens',
      'rebuilding a list before validating its replacement or leaving input connections alive after cleanup',
      'unbounded notification queues, invalid objective progress, fabricated completion and broken UTF-8 labels',
    ],
    defaultParent: 'game.ReplicatedStorage',
    className: 'ModuleScript',
    api: [
      'AppleUI.mount(playerGui, { name = "AppleUI", theme = "simulator", title = "Upgrades", balance = "—", balanceLabel = "COINS", showShop = true, reducedMotion = false, onRequest = function(itemId) -- return serverConfirmedBoolean, message end }) -> ui; CLIENT ONLY. theme accepts studio, simulator, tycoon, obby, horror, racing, roleplay, tower_defense, fps_arena, anime_battle, survival; unknown themes are refused. Optional accent must be Color3. Set showShop=false for a HUD without a shop; server validates item, price, balance and request rate. A selected theme is not a verified visual result.',
      'AppleUI.mount(...) returns ui:setItems({{id="speed", name="Trail boots", description="Move through the course", price="100 Coins", icon="bolt", badge="Tier 1", owned=false, disabled=false}}), ui:setBalance(serverConfirmedDisplay), ui:setStatus(text), ui:open(), ui:close(), ui:destroy(); icons are optional procedural coin/gem/shield/bolt/crate glyphs, not asset previews. owned=true must come from observed server state; acknowledgement alone never infers ownership. Never update balance or claim a grant before server acknowledgement.',
      'AppleUI.mount(...) returns ui:setObjectives({{id="lap", title="Finish the course", current=2, target=5, completed=false}}), replacing at most 8 objectives atomically; omit current/target for unknown progress, set completed only from authoritative state, and use {} to hide. No quest or reward logic is installed.',
      'AppleUI.mount(...) returns ui:notify(message, "info" | "success" | "error", seconds=5) -> boolean; 2–12 seconds, at most 5 queued, false when full or destroyed. Success is only for observed server confirmation. Notices pause while the shop is open; ui:clearNotifications() clears them. Neither API sends remotes or grants anything.',
    ],
    source: APPLE_UI_SOURCE,
  },
  daily_reward: {
    id: 'daily_reward',
    needs: ['profile_store', 'currency'],
    moduleName: 'DailyReward',
    summary: 'A bonus on the first join of a day, with a streak that is right about what a day is.',
    prevents: [
      'a date read from the client, which is a setting the player can change and turns a daily reward into an unlimited one',
      'a streak wiped at new year, because os.date yday resets and 31 December to 1 January reads as a 364-day gap',
      'a streak that depends on the hour somebody logs in, because elapsed seconds is not a day boundary',
      'claiming twice from a rejoin, a second server, or a double-fired button',
      'a clock moved BACKWARDS being treated as a new day',
      'awarding and then failing to record it, so the same day pays twice',
      'a streak longer than the reward table reaching award() with nil as the amount',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'DailyReward.configure({ get = Profile.get, award = Currency.award, rewards = { 50, 75, 100 } })',
      'DailyReward.claim(player)',
      'DailyReward.status(player)',
    ],
    source: DAILY_REWARD_SOURCE,
  },
  buy_buttons: {
    id: 'buy_buttons',
    needs: ['profile_store', 'currency'],
    moduleName: 'BuyButtons',
    summary: 'The tycoon purchase pad — the money leaves and the thing appears, in one write that cannot half-happen.',
    prevents: [
      'a player paying and receiving nothing, because the deduction and the unlock were two writes with a failure between them',
      'a Touched burst buying the same pad many times before the first purchase has been recorded',
      'a visitor standing on a stranger\'s pad and buying an upgrade on a plot that is not theirs',
      'a returning player finding the plot they paid for stripped back to its first day',
      'a place saved with the upgrades already built handing them to everybody for free',
      'a pad wired to nothing taking the money and showing no thing',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'BuyButtons.configure({ get = Profile.get, spend = Currency.spend })',
      'BuyButtons.add({ plot = plot, button = pad, id = "dropper2", price = 250, unlocks = model })',
      'BuyButtons.restore(player)',
      'BuyButtons.owned(player)',
    ],
    source: BUY_BUTTONS_SOURCE,
  },
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
  income: {
    id: 'income',
    needs: ['currency'],
    moduleName: 'Income',
    summary: 'The tycoon dropper-and-collector chain, with a cap so it cannot bury the server in parts.',
    prevents: [
      'a dropper spawning parts forever — ten droppers at one a second is 36,000 parts an hour, and the server degrades until it dies with no crash anyone can point at',
      'paying whoever TOUCHED the collector rather than whoever owns the plot, so a visitor earns a neighbour\'s income',
      'a drop paying out dozens of times because Touched fires repeatedly while a part rests on the collector',
      'a dropper feeding a plot nobody owns, which is the state a plot is in for most of a server\'s life',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'Income.configure({ award = function(player, amount) end, maxLive = 24 })',
      'Income.addDropper({ plot = plotModel, spawner = part, value = 5, everySeconds = 2 })',
      'Income.collector(plot, part)',
      'Income.step(dt)   -- the loop calls this; call it directly to test a chain',
      'Income.ownerOf(plot) -> Player | nil',
      'Income.liveCount(dropper) -> number',
    ],
    source: TYCOON_SOURCE,
  },
  collectibles: {
    id: 'collectibles',
    moduleName: 'Collectibles',
    summary: 'Touch to collect, score it on the leaderboard, and bring it back — the coin loop, done once, correctly.',
    prevents: [
      'finding the coins by PART name when the name is on the Model and its parts are called something else, so the script manages zero coins and says nothing',
      'setting Transparency on a Model, which has no such property — the Touched handler errors after awarding the point and before hiding anything',
      'the Coins stat living in another script that errors before it runs, so no player ever has one to add to',
      'Touched firing once per limb, awarding several points for one pickup',
      'a hidden coin that can still be collected because CanTouch stayed on, or a respawn that makes every part opaque including the ones meant to be see-through',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'Collectibles.configure({ stat = "Coins", value = 1, respawnSeconds = 10, spinDegreesPerSecond = 90 })',
      'Collectibles.addNamed(workspace, "^Coin") -> number   -- every child of the parent whose NAME matches',
      'Collectibles.add(modelOrPart) -> boolean',
      'Collectibles.start() -> boolean   -- idempotent; creates leaderstats.<stat> unless configure({ award = fn })',
      'Collectibles.collect(root, player) -> boolean   -- Touched calls this; call it directly to test',
      'Collectibles.isHidden(root) -> boolean',
      'Collectibles.count() -> number',
      'Collectibles.step(dt)   -- the spin; the loop calls this',
    ],
    source: COLLECTIBLES_SOURCE,
  },
  leaderboard: {
    id: 'leaderboard',
    moduleName: 'Leaderboard',
    summary: 'A global top-N that respects the scarcest request budget Roblox has, and never blanks itself on a failure.',
    prevents: [
      'fetching with GetSortedAsync on player join — it is a LIST operation, 5 per minute plus 2 per player against 60 plus 40 for an ordinary read, so a join-triggered fetch spends the scarcest budget in the API on the most repetitive request',
      'a failed fetch blanking the board, which reads as "nobody has scored" rather than "the service is down" and tells a player their progress is gone',
      'a half-read page being shown as a complete board',
      'two refresh loops running at once and doubling the spend on the one budget this protects',
      'submitting a fractional score to an OrderedDataStore, which stores integers and mangles the rest silently',
      'a retried or out-of-order submit lowering a score, which SetAsync would allow and a read-modify-write cannot',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'Leaderboard.configure({ store = "Coins_v1", size = 10, refreshSeconds = 60, monotonic = true })',
      'Leaderboard.start() -> boolean   -- idempotent',
      'Leaderboard.submit(player, score) -> boolean',
      'Leaderboard.top() -> entries, fetchedAtOrNil',
      'Leaderboard.refresh() -> boolean   -- one fetch; false leaves the previous board standing',
      'Leaderboard.stop()',
    ],
    source: LEADERBOARD_SOURCE,
  },
  rounds: {
    id: 'rounds',
    moduleName: 'Rounds',
    summary: 'A match loop with one owner, an explicit participant set, and cleanup on every exit path.',
    prevents: [
      'two loops advancing the same round because something called start() twice, which halves every timer and fires every event twice while nothing errors',
      'a round that never ends because its win condition stopped being reachable when the last player left',
      'scores, flags and connections from one round still being live in the next',
      'a player who joined at second 40 being dropped into a match they cannot win, or excluded with no explanation',
      'a handler that errors leaving the machine stuck in playing forever',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'Rounds.configure({ roundSeconds = 120, intermissionSeconds = 15, minimumPlayers = 2 })',
      'Rounds.onStart(function(players) end)',
      'Rounds.onEnd(function(players, reason) end)',
      'Rounds.start() -> boolean   -- idempotent',
      'Rounds.tick(dt) -> phase    -- the loop calls this; call it directly to test a round',
      'Rounds.finish(reason) -> boolean',
      'Rounds.phase() -> "idle" | "intermission" | "playing"',
      'Rounds.participants() -> players captured when this round began',
      'Rounds.number() -> number',
      'Rounds.stop() -> boolean',
    ],
    source: ROUNDS_SOURCE,
  },
  checkpoints: {
    id: 'checkpoints',
    needs: ['profile_store'],
    moduleName: 'Checkpoints',
    summary: 'The obby stage loop: progress that only moves forward, survives death, and actually respawns you where you got to.',
    prevents: [
      'the stage going BACKWARDS when a player re-touches an earlier checkpoint, which reads as the game stealing their progress',
      'Touched firing dozens of times a second and once per limb, rewriting the save on every one',
      'respawning at the default SpawnLocation while the saved stage still says 9, because Roblox picks a spawn before anything can move the character',
      'the furthest stage living on the character or in leaderstats, where a reset loses it',
    ],
    defaultParent: 'game.ServerScriptService',
    className: 'ModuleScript',
    api: [
      'Checkpoints.configure({ get = Profile.get, field = "stage", folder = workspace.Checkpoints })',
      'Checkpoints.bind(player) -> boolean   -- after Profile.load returns non-nil',
      'Checkpoints.stage(player) -> number | nil',
      'Checkpoints.reach(player, stage) -> boolean   -- true only when it advanced',
      'Checkpoints.spawnFor(stage) -> Instance | nil',
      'Checkpoints.forget(player)',
    ],
    source: CHECKPOINTS_SOURCE,
  },
  currency: {
    id: 'currency',
    needs: ['profile_store'],
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
    needs: ['profile_store'],
    moduleName: 'Receipts',
    summary: 'Developer product purchases granted exactly once or not at all — the award and the receipt id in one write.',
    prevents: [
      'returning PurchaseGranted before the grant is written, so the player pays and receives nothing',
      'a retried receipt granting the reward a second time, which the obvious mark-then-grant-then-mark implementation still allows',
      'awarding into player data that never loaded',
      'a purchase being consumed while the player is not in the server',
      'coins earned during the purchase write being erased when the session snapshot is put back',
      'two receipts for one player overlapping, so the second save overwrites the first purchase',
      'a failed save being retried into a second award of the same purchase',
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
