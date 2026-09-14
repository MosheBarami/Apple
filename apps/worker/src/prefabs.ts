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
		-- Either the service failed, or another server holds a live lock. Both mean: DO NOT SAVE.
		--
		-- Remembered as an unsaveable session rather than simply forgotten. Clearing the entry would
		-- also work today, because release and commit both refuse a nil entry — but then canSave
		-- would be a flag that is never false, and the rule it names would be enforced by an absence
		-- somewhere else. A later change that caches a failed load for any reason would reintroduce
		-- the account-wiping write with nothing left to stop it. A nil value keeps get() returning
		-- nil, and the flag does the refusing.
		cache[player.UserId] = { value = nil, canSave = false }
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
	player.CharacterAdded:Connect(function(character)
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
	end)

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
	task.spawn(function()
		while running do
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
	phase = "intermission"
	elapsed = 0
	task.spawn(function()
		while running do
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

local droppers = {}
local awardFn = nil
local lastCollect = {}

function Income.configure(opts)
	awardFn = opts.award
	if opts.maxLive ~= nil then
		MAX_LIVE_PER_DROPPER = opts.maxLive
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
	local d = {
		plot = spec.plot,
		spawner = spec.spawner,
		value = spec.value or 1,
		everySeconds = spec.everySeconds or 2,
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
		if oldest ~= nil and oldest.Parent ~= nil then
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
		while d.since >= d.everySeconds do
			d.since = d.since - d.everySeconds
			Income.drop(d)
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
  income: {
    id: 'income',
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
