--!strict
--[[
	Crystal Canyon — all DataStore I/O, and nothing else in the game touches it.

	The failure this module exists to prevent is duplication. If the same
	profile is live on two servers at once, both of them bank coins against
	their own copy and whichever saves last wins — which means a player who can
	get themselves into two servers can mint currency without ever touching a
	remote. Every design decision below follows from that:

	  * the profile and its session lock live in ONE DataStore value, because a
	    single UpdateAsync on a single key is the only cross-server atomic
	    operation the platform gives us;
	  * a load that finds a live foreign lock refuses and kicks rather than
	    guessing;
	  * a save that finds a live foreign lock declines to write rather than
	    resurrecting a stale balance over a newer one;
	  * a profile that failed to load is tracked as failed, is never handed to
	    gameplay, and is never written back over the good copy on disk.

	The one deliberate softening is Studio. Studio has no DataStore access in
	many configurations, and a benchmark nobody can playtest is worthless — so
	in Studio only, an unreachable DataStore degrades to an in-memory profile
	and says so loudly, instead of kicking. A live server never does this: a
	silent switch to "not saving" in production is a worse outage than a kick.
]]

local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Config = require(ReplicatedStorage.CrystalCanyon.Config)
local Profile = require(script.Parent.Profile)

type ProfileData = Profile.ProfileData

local DataService = {}

-- Identity of this server, as written into the lock. Studio reports an empty
-- JobId, so give it a unique one per run: two consecutive Studio playtests are
-- genuinely two sessions, and the second must be able to tell that the first
-- one's lock is not its own.
local JOB_ID: string = if game.JobId ~= "" then game.JobId else "studio:" .. HttpService:GenerateGUID(false)

local IS_STUDIO = RunService:IsStudio()

-- Roblox grants a bounded grace period (~30s) after BindToClose fires before it
-- kills the server. Stay under it so the wait itself is never what loses a save.
local CLOSE_BUDGET_SECONDS = 25

-- How long a final save will wait for an in-flight autosave on the same profile
-- before writing anyway. Short: this only ever runs on the way out.
local FINAL_SAVE_WAIT_SECONDS = 5

type Lock = {
	jobId: string,
	timestamp: number,
}

--[[ What actually lives at the key. The lock is inside the same value as the
	 profile on purpose — a lock in a second key could not be taken and released
	 atomically with the write it is protecting. ]]
type Envelope = {
	profile: any,
	lock: Lock?,
}

type Session = {
	player: Player,
	key: string,
	data: ProfileData?,
	-- "loading" -> nothing to grant yet. "failed" -> nothing to grant, ever,
	-- and nothing to write back. Only "ready" is playable.
	state: "loading" | "ready" | "failed",
	-- false once this profile is in-memory only (Studio, or a lock lost
	-- mid-session). Gameplay still works; writes are suppressed.
	persist: boolean,
	saving: boolean,
	closing: boolean,
	lastAccrual: number,
}

local sessions: { [Player]: Session } = {}
local store: DataStore? = nil
local persistenceAvailable = true

-- Logging ------------------------------------------------------------------

local function logDegraded(reason: string)
	if not persistenceAvailable then
		return
	end
	persistenceAvailable = false
	warn(
		`[CrystalCanyon] PERSISTENCE DEGRADED — profiles are in-memory only for this session `
			.. `and will be lost when the server stops. Nothing will be written to the DataStore. `
			.. `Reason: {reason}`
	)
end

--[[ Recognise the permanent "this place cannot reach the DataStore" failures so
	 a Studio playtest does not sit through four rounds of backoff before
	 arriving at the same answer. Used ONLY to skip the wait in Studio — it never
	 decides whether to degrade, because a pattern match against an error string
	 is not something a live server's persistence should hinge on. ]]
local function looksPermanent(err: any): boolean
	local text = string.lower(tostring(err))
	return string.find(text, "studio access to apis") ~= nil
		or string.find(text, "api services") ~= nil
		or string.find(text, "403") ~= nil
		or string.find(text, "not published") ~= nil
end

--[[ Retry with exponential backoff plus jitter. The jitter matters: without it,
	 every request that failed together during a blip retries together, and the
	 retry storm is indistinguishable from the outage that caused it. ]]
local function withRetry(label: string, fn: () -> any): (boolean, any)
	local lastErr: any = "unknown"

	for attempt = 1, Config.Store.MaxRetries do
		local ok, result = pcall(fn)
		if ok then
			return true, result
		end

		lastErr = result
		if IS_STUDIO and looksPermanent(result) then
			return false, result
		end

		if attempt < Config.Store.MaxRetries then
			local backoff = Config.Store.RetryBaseSeconds * 2 ^ (attempt - 1)
			task.wait(backoff + math.random() * Config.Store.RetryBaseSeconds)
		end
	end

	warn(`[CrystalCanyon] {label} failed after {Config.Store.MaxRetries} attempts: {lastErr}`)
	return false, lastErr
end

-- Envelope + lock ----------------------------------------------------------

--[[ Interpret whatever is actually at the key as an envelope. The single
	 discriminator for "is this our wrapper" lives here, and everything that
	 touches the stored value goes through it.

	 It has to accept `lock` alone as proof, not just `profile`: the very first
	 write for a key stores the lock before there is any profile to store
	 alongside it, and reading that back as a bare legacy profile would swallow
	 the lock — which is the one field the whole module exists to protect.

	 `profile` always comes back a table so callers never branch on it. Anything
	 unrecognisable becomes an empty profile, which Profile.sanitize turns into
	 a fresh one. ]]
local function toEnvelope(stored: any): Envelope
	if type(stored) == "table" and (type(stored.profile) == "table" or type(stored.lock) == "table") then
		local envelope = stored :: Envelope
		if type(envelope.profile) ~= "table" then
			envelope.profile = {}
		end
		return envelope
	end

	-- Not our wrapper: either nothing at all, or a value from before the
	-- envelope existed, in which case the whole thing is the profile.
	return { profile = if type(stored) == "table" then stored else {} }
end

--[[ True if this lock belongs to a different server that is still plausibly
	 alive, which is the only case in which we must refuse.

	 Two judgement calls are encoded here:

	 A negative age (the lock's timestamp is in our future) counts as LIVE, not
	 stale. That is clock skew between two servers, and "ahead of us" is not
	 evidence of abandonment.

	 A lock whose timestamp is unreadable counts as ABANDONED. A lock we cannot
	 date is a lock we could never expire, and permanently locking a player out
	 of their own save is a worse outcome than the duplication risk — which is
	 itself close to zero here, since an unreadable timestamp means the server
	 that wrote it was already malfunctioning. ]]
local function isForeignLockLive(lock: any, now: number): boolean
	if type(lock) ~= "table" then
		return false
	end
	if type(lock.jobId) ~= "string" or lock.jobId == JOB_ID then
		return false
	end

	local timestamp = lock.timestamp
	if type(timestamp) ~= "number" or timestamp ~= timestamp then
		return false
	end
	if timestamp == math.huge or timestamp == -math.huge then
		return false
	end

	return (now - timestamp) < Config.Store.SessionLockStaleSeconds
end

-- Load ---------------------------------------------------------------------

type AcquireStatus = "ok" | "locked" | "error"

--[[ Take the session lock and read the profile in a single UpdateAsync, so no
	 second server can observe "unlocked" between our read and our write. ]]
local function acquireProfile(session: Session): (AcquireStatus, ProfileData?)
	local s = store
	if not s then
		return "error", nil
	end

	local userIds = { session.player.UserId }
	local blocked = false

	local ok, result = withRetry(`load {session.key}`, function()
		return s:UpdateAsync(session.key, function(stored): (any, { number }?)
			-- This transform runs on the DataStore's side of a read-modify-write
			-- and may be re-run if another server wrote in between. It therefore
			-- must not yield and must recompute everything from `stored` — hence
			-- resetting `blocked` on every pass rather than trusting the last one.
			blocked = false

			local now = os.time()
			local envelope = toEnvelope(stored)

			if isForeignLockLive(envelope.lock, now) then
				-- Returning nil aborts the update: no write, and crucially no
				-- lock taken. Duplicating this profile is the one outcome worse
				-- than failing to load it.
				blocked = true
				return nil
			end

			envelope.lock = { jobId = JOB_ID, timestamp = now }
			return envelope, userIds
		end)
	end)

	-- Order matters. An aborted transform is a SUCCESSFUL UpdateAsync that
	-- returns nil, so `ok` is true and `result` is nil in the refusal case;
	-- checking `blocked` first is what distinguishes refusal from a real read.
	if blocked then
		return "locked", nil
	end
	if not ok then
		return "error", nil
	end

	return "ok", Profile.sanitize(toEnvelope(result).profile)
end

--[[ Hand back a lock we took for a session that ended before it began — the
	 player left mid-load. Without this the profile stays locked for
	 SessionLockStaleSeconds and the player's own rejoin is what gets refused. ]]
local function releaseOrphanedLock(key: string, data: ProfileData, userId: number)
	local s = store
	if not s then
		return
	end

	task.spawn(function()
		withRetry(`release {key}`, function()
			return s:UpdateAsync(key, function(stored): (any, { number }?)
				local envelope = toEnvelope(stored)
				local lock = envelope.lock
				-- Only ever release our own lock; by now another server may
				-- legitimately hold it.
				if type(lock) == "table" and lock.jobId ~= JOB_ID then
					return nil
				end
				envelope.profile = data
				envelope.lock = nil
				return envelope, { userId }
			end)
		end)
	end)
end

-- Playtime -----------------------------------------------------------------

--[[ Accrue wall-clock seconds into stats.playtime just before each write, so
	 the stat is correct without a per-second heartbeat. Only whole seconds are
	 banked and the remainder is carried, otherwise every save would silently
	 discard up to a second. ]]
local function accruePlaytime(session: Session)
	local data = session.data
	if not data then
		return
	end

	local now = os.clock()
	local whole = math.floor(now - session.lastAccrual)
	if whole > 0 then
		data.stats.playtime += whole
		session.lastAccrual += whole
	end
end

-- Public surface -----------------------------------------------------------

function DataService.get(player: Player): ProfileData?
	local session = sessions[player]
	if session and session.state == "ready" then
		return session.data
	end
	-- nil while loading AND nil forever if the load failed. Callers cannot tell
	-- the two apart, and must not: neither is a profile you may grant against.
	return nil
end

function DataService.isReady(player: Player): boolean
	local session = sessions[player]
	return session ~= nil and session.state == "ready" and session.data ~= nil
end

--[[ Write the profile back. `isFinal` also releases the session lock, so it is
	 the last write for this session on this server.

	 Returns whether bytes actually reached the DataStore, which is false for
	 every legitimate no-op (still loading, failed load, degraded to in-memory,
	 autosave skipped because one is already in flight) as well as for a real
	 failure. Callers use it for logging, never for correctness. ]]
function DataService.save(player: Player, isFinal: boolean?): boolean
	local session = sessions[player]
	if not session or session.state ~= "ready" then
		-- A profile that never loaded is never written back. This is the whole
		-- guard: without it, a player whose load failed would be handed a fresh
		-- profile by the rest of the game and then save it over their real one.
		return false
	end

	local data = session.data
	if not data then
		return false
	end

	local final = isFinal == true

	if not session.persist or not persistenceAvailable then
		-- Degraded (Studio, or a lock lost mid-session). Keep the playtime stat
		-- honest for the live session, write nothing.
		accruePlaytime(session)
		return false
	end

	if final then
		-- Claim the session before waiting, so any autosave that wakes up
		-- during the wait bails out below instead of queueing behind us.
		session.closing = true

		-- An autosave that landed AFTER the lock release would re-take the lock
		-- on behalf of a server this player has already left, stranding the
		-- profile for SessionLockStaleSeconds. Let the in-flight one finish
		-- first; it is the same table, so nothing is lost by waiting.
		local deadline = os.clock() + FINAL_SAVE_WAIT_SECONDS
		while session.saving and os.clock() < deadline do
			task.wait(0.1)
		end
	elseif session.saving or session.closing then
		-- Another write of the identical table would cost a request and change
		-- nothing.
		return false
	end

	local s = store
	if not s then
		return false
	end

	session.saving = true
	accruePlaytime(session)

	-- Sanitising on the way out does two jobs. It is the deep copy the
	-- transform needs, because the transform can re-run at any moment while
	-- gameplay keeps mutating the live table; and it is the last gate against
	-- persisting a NaN that would otherwise have to be repaired on every
	-- subsequent load.
	local snapshot = Profile.sanitize(data)
	local userIds = { player.UserId }
	local blocked = false

	local ok = withRetry(`save {session.key}`, function()
		return s:UpdateAsync(session.key, function(stored): (any, { number }?)
			blocked = false

			local now = os.time()
			local envelope = toEnvelope(stored)

			if isForeignLockLive(envelope.lock, now) then
				-- Another server legitimately took this profile over, because
				-- our lock went stale while we were hung. Its copy is the live
				-- one; writing ours would resurrect a balance the player has
				-- already moved past.
				blocked = true
				return nil
			end

			envelope.profile = snapshot
			envelope.lock = if final then nil else { jobId = JOB_ID, timestamp = now }
			return envelope, userIds
		end)
	end)

	session.saving = false

	if blocked then
		-- Stop pretending we own this profile. Gameplay continues on the
		-- in-memory copy; nothing further is written, so we cannot fight the
		-- server that now owns it.
		session.persist = false
		warn(
			`[CrystalCanyon] save refused for {player.Name} ({player.UserId}): the session lock is `
				.. `held by another server. This session is now in-memory only.`
		)
		return false
	end

	return ok
end

-- Lifecycle ----------------------------------------------------------------

local function startAutosave(session: Session)
	if not session.persist then
		return
	end

	task.spawn(function()
		-- A random phase offset held for the life of the session is what stops
		-- a wave of players who joined together from writing in the same frame
		-- once a minute for the rest of the round. The per-iteration jitter
		-- keeps them from re-converging as saves take varying time.
		task.wait(Config.Store.AutosaveSeconds * (0.5 + math.random() * 0.5))

		while sessions[session.player] == session and not session.closing do
			DataService.save(session.player, false)
			task.wait(Config.Store.AutosaveSeconds * (0.9 + math.random() * 0.2))
		end
	end)
end

local function onPlayerAdded(player: Player)
	if sessions[player] then
		return
	end

	local session: Session = {
		player = player,
		key = Config.Store.KeyPrefix .. tostring(player.UserId),
		data = nil,
		state = "loading",
		persist = persistenceAvailable,
		saving = false,
		closing = false,
		lastAccrual = os.clock(),
	}
	sessions[player] = session

	if not persistenceAvailable then
		-- Already known degraded from an earlier player; skip the round trip
		-- that is going to fail the same way.
		session.data = Profile.new()
		session.persist = false
		session.state = "ready"
		return
	end

	local status, data = acquireProfile(session)

	-- The player can leave during that round trip. PlayerRemoving clears the
	-- table, so an entry that is no longer ours means this session is over
	-- before it started — and we are holding a lock nobody will release.
	if sessions[player] ~= session then
		if status == "ok" and data then
			releaseOrphanedLock(session.key, data, player.UserId)
		end
		return
	end

	if status == "locked" then
		session.state = "failed"
		player:Kick(
			"Your Crystal Canyon save is still open on another server.\n\n"
				.. "Nothing has been lost — please wait about a minute and rejoin. "
				.. "This check is what keeps your coins and upgrades from being overwritten."
		)
		return
	end

	if status == "error" then
		if IS_STUDIO then
			logDegraded("the DataStore is unreachable from this Studio session")
			session.data = Profile.new()
			session.persist = false
			session.state = "ready"
			return
		end

		-- Tracked explicitly as failed and left in the table: get() and
		-- isReady() keep answering "no profile" even in the window before the
		-- kick takes effect, so nothing can be granted and nothing can be saved.
		session.state = "failed"
		player:Kick(
			"We couldn't load your Crystal Canyon save.\n\n"
				.. "Nothing has been lost and nothing was overwritten — please rejoin."
		)
		return
	end

	session.data = data
	session.state = "ready"
	session.lastAccrual = os.clock()
	startAutosave(session)
end

local function onPlayerRemoving(player: Player)
	local session = sessions[player]
	if not session then
		return
	end

	session.closing = true
	if session.state == "ready" and session.persist then
		-- Final: writes the profile and releases the lock in the same
		-- UpdateAsync, so the next server this player joins is never refused by
		-- a lock we forgot to hand back.
		DataService.save(player, true)
	end

	-- Cleared last, because save() resolves the session through this table and
	-- the autosave loop uses it as its liveness check.
	sessions[player] = nil
end

local function onClose()
	local pending = 0

	for player, session in sessions do
		if session.state == "ready" and session.persist then
			pending += 1
			task.spawn(function()
				DataService.save(player, true)
				pending -= 1
			end)
		end
	end

	-- In parallel, then wait for the slowest rather than the sum: a full server
	-- saving one profile at a time would not finish inside the shutdown grace
	-- period, and the players at the end of the queue are the ones who lose the
	-- session.
	local deadline = os.clock() + CLOSE_BUDGET_SECONDS
	while pending > 0 and os.clock() < deadline do
		task.wait(0.1)
	end

	if pending > 0 then
		warn(`[CrystalCanyon] shutdown budget expired with {pending} profile(s) still writing`)
	end
end

--[[ `ctx` is accepted to match the module contract and deliberately unused:
	 DataService is the bottom of the dependency order and must not reach any
	 sibling service, or a save could end up depending on the economy it is
	 supposed to be recording. ]]
function DataService.init(_ctx: any)
	local ok, result = pcall(function()
		return DataStoreService:GetDataStore(Config.Store.Name)
	end)

	if ok then
		store = result
	else
		logDegraded(`GetDataStore failed: {result}`)
	end

	Players.PlayerAdded:Connect(onPlayerAdded)
	Players.PlayerRemoving:Connect(onPlayerRemoving)

	-- Anyone who joined before init ran — a Studio hot start, or a slow require
	-- chain on a busy server — would otherwise never get a profile at all.
	for _, player in Players:GetPlayers() do
		task.spawn(onPlayerAdded, player)
	end

	game:BindToClose(onClose)
end

return DataService
