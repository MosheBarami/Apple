--!strict
-- Apple Studio transport.
--
-- This module is deliberately only a transport.  The entry point owns the dock and the command
-- implementation; this file owns the small HTTPS channel between that dock and the Apple session.
-- There is no persisted session here: pairing is an action the person takes in Studio, and the
-- resulting credential lives only in the current Lua state.

local HttpService = game:GetService("HttpService")

local APPLE_ORIGIN = "https://apple.moshe-barami111.workers.dev"
local CLAIM_URL = APPLE_ORIGIN .. "/api/studio/claim"
local POLL_URL = APPLE_ORIGIN .. "/api/studio/poll"
-- 1.1.0 because this source does more than the 1.0.0 build published to the Creator Store on
-- 2026-09-19 (asset 107230158271368): native viewport capture, Run-mode control and model
-- inspection. A build that reported 1.0.0 would be indistinguishable from the store build while
-- behaving differently. The worker's LATEST_PLUGIN_VERSION stays at the store's version until this
-- one is published. init.server.luau repeats this literal in its label and its state event, and
-- packages/evals/src/plugin-version.test.mjs fails if the copies disagree.
-- 1.2.0 (2026-09-23): an uploaded image id is writable on UI images/decals, a checkpoint holds its
-- MeshParts (F-053), and the dock says a Studio restart needs a new pairing code (F-026).
-- 1.3.0 (2026-09-23, D-FXLIB-1): a Sound may carry a library audio id, an effect may name an engine
-- particle texture, flipbook and Squash properties are writable, and preview_sound plays a sound here.
-- 1.4.0 (2026-09-25, F-059): the dock can ask and answer which asset sources this project may use.
-- 1.4.1 (2026-09-25): the dock asks once for free Roblox asset consent without a source selector.
local PLUGIN_VERSION = "1.4.1"
local PLUGIN_PROTOCOL = "1"

-- The worker currently serves at most ten operations.  These limits are client-side guardrails
-- as well: accepting an unbounded response or keeping an unbounded replay table would turn a
-- server mistake into an unbounded Studio-side allocation.
local MAX_BATCH = 10
local MAX_RESULT_QUEUE = 64
local MAX_REPLAY = 256
local MAX_EVENT_QUEUE = 64
local MAX_SELECTION_ITEMS = 100
local MAX_EVENT_PATH = 512
local MAX_EVENT_MESSAGE = 600
local MAX_TOKEN_CHARS = 200
local MAX_CODE_CHARS = 64
local RETRY_WAIT_SECONDS = 2
local MIN_WAIT_SECONDS = 0.05
local MAX_WAIT_SECONDS = 10

type Config = {
	plugin: any,
	execute: (string, any, (() -> boolean)?) -> any,
	state: () -> any,
	capabilities: (() -> any)?,
	onStatus: (string) -> (),
	onActivity: (string) -> (),
	-- F-059: told { owed, message? } when the worker's asset-source question opens or settles.
	onAssetSources: ((any) -> ())?,
}

type Session = {
	token: string,
	projectName: string,
	generation: number,
	pendingResults: { [number]: any },
	pendingResultIds: { [string]: boolean },
	replay: { [string]: any },
	replayOrder: { [number]: string },
	pendingEvents: { [number]: { sequence: number, event: any, inFlight: boolean } },
	nextEventSequence: number,
	capabilities: any?,
	capabilitiesPending: boolean,
	retrying: boolean?,
	assetSourcesAnswer: any?,
	assetSourcesOwed: boolean,
}

type BridgeObject = {
	config: Config,
	connected: boolean,
	destroyed: boolean,
	generation: number,
	session: Session?,
	unloadingConnection: any,
	connect: (BridgeObject, string) -> (boolean, string),
	disconnect: (BridgeObject) -> (),
	destroy: (BridgeObject) -> (),
	isConnected: (BridgeObject) -> boolean,
	pushEvent: (BridgeObject, any) -> boolean,
	answerAssetSources: (BridgeObject, any) -> boolean,
	_end: (BridgeObject, string?) -> (),
}

local Bridge = {} :: { new: (Config) -> BridgeObject }
Bridge.__index = Bridge

local function callStatus(config: Config, message: string)
	-- A panel callback should never be allowed to kill the poll loop.  The text passed here is
	-- always a bounded, local sentence or a server sentence checked by safeRemoteMessage; no token
	-- or raw RequestAsync error is ever included.
	pcall(config.onStatus, message)
end

local function callActivity(config: Config, message: string)
	pcall(config.onActivity, string.sub(message, 1, 240))
end

local function finiteNumber(value: any): boolean
	return type(value) == "number" and value == value and value ~= math.huge and value ~= -math.huge
end

local function validState(value: any): boolean
	-- A state event is the place evidence that makes pairing safe.  Sending a claim or poll
	-- without it would let the worker bind (or serve) a project without knowing what Studio has
	-- open, so malformed/failed observers fail closed before any request or operation.
	if type(value) ~= "table" or value.kind ~= "state" then return false end
	if type(value.placeName) ~= "string" or #value.placeName == 0 or #value.placeName > 200 then return false end
	if not finiteNumber(value.placeId) or value.placeId < 0 or value.placeId ~= math.floor(value.placeId) then return false end
	if not finiteNumber(value.gameId) or value.gameId < 0 or value.gameId ~= math.floor(value.gameId) then return false end
	if type(value.isRunMode) ~= "boolean" then return false end
	if not finiteNumber(value.selectionCount) or value.selectionCount < 0 or value.selectionCount ~= math.floor(value.selectionCount) then return false end
	return type(value.pluginVersion) == "string" and #value.pluginVersion > 0 and #value.pluginVersion <= 64
end

local EVENT_LEVELS = { output = true, info = true, warn = true, error = true }

-- Events are produced by local Studio signals, but they still share a poll body with operation
-- results and therefore cross the same bounded transport boundary.  Shape them here rather than
-- trusting whichever entry point happens to call pushEvent in a future build.
local function safeEvent(value: any): any?
	if type(value) ~= "table" then return nil end
	if value.kind == "log" then
		if type(value.message) ~= "string" or #value.message == 0 or #value.message > MAX_EVENT_MESSAGE then return nil end
		if type(value.level) ~= "string" or not EVENT_LEVELS[value.level] then return nil end
		if not finiteNumber(value.clock) or value.clock < 0 then return nil end
		return { kind = "log", message = value.message, level = value.level, clock = value.clock }
	end
	if value.kind ~= "selection" or type(value.items) ~= "table" then return nil end
	local items = {}
	for index = 1, math.min(#value.items, MAX_SELECTION_ITEMS) do
		local item = value.items[index]
		if type(item) ~= "table" or type(item.path) ~= "string" or #item.path == 0 or #item.path > MAX_EVENT_PATH then
			return nil
		end
		if type(item.class) ~= "string" or #item.class == 0 or #item.class > 64 then return nil end
		table.insert(items, { path = item.path, class = item.class })
	end
	if not finiteNumber(value.count) or value.count < #items or value.count ~= math.floor(value.count) then return nil end
	if not finiteNumber(value.clock) or value.clock < 0 then return nil end
	return {
		kind = "selection",
		items = items,
		count = value.count,
		truncated = value.count > #items,
		clock = value.clock,
	}
end

local function readState(config: Config): (boolean, any)
	-- State is sampled for every poll, even when there are no operations.  A failing observer is
	-- not turned into a fabricated event.  Returning false lets the caller stop before sending a
	-- request whose place identity was not observed.
	local ok, value = pcall(config.state)
	if ok and validState(value) then return true, value end
	return false, nil
end

local function safeRemoteMessage(value: any, token: string?, fallback: string): string
	if type(value) ~= "string" then
		return fallback
	end
	if #value == 0 or #value > 240 then
		return fallback
	end
	if string.find(value, "[\r\n\000]", 1) ~= nil then
		return fallback
	end
	if token and #token > 0 and string.find(value, token, 1, true) ~= nil then
		return fallback
	end
	return value
end

local function statusFromAuth(body: any, token: string): string
	local fallback = "Session ended — reconnect with a new code"
	if type(body) ~= "table" then
		return fallback
	end
	local errorKind = body.error
	if errorKind == "superseded" then
		return safeRemoteMessage(
			body.message,
			token,
			"This project was paired again from another Studio window. Pair this Studio again to bring it back here."
		)
	end
	if errorKind == "token expired" then
		return safeRemoteMessage(body.message, token, "This pairing has expired. Pair again from the Apple web app.")
	end
	return fallback
end

local function parseResponse(response: any): (boolean, number, any)
	if type(response) ~= "table" then
		return false, 0, nil
	end
	local status = tonumber(response.StatusCode) or 0
	local success = response.Success
	if success == nil then
		success = status >= 200 and status < 300
	end
	local raw = response.Body
	local decoded: any = {}
	if type(raw) == "string" and #raw > 0 then
		local decodedOk, value = pcall(function()
			return HttpService:JSONDecode(raw)
		end)
		if decodedOk then decoded = value else decoded = nil end
	end
	if success ~= true then return false, status, decoded end
	return true, status, decoded
end

local function post(url: string, body: any, token: string?): (boolean, number, any)
	-- Keep the wire names used by the existing worker.  The URL is a module constant, not a value
	-- supplied by a prompt, a project, or a server response.
	local encodedOk, encoded = pcall(function()
		return HttpService:JSONEncode(body)
	end)
	if not encodedOk or type(encoded) ~= "string" then
		return false, 0, nil
	end

	local requestedOk, response = pcall(function()
		return HttpService:RequestAsync({
			Url = url,
			Method = "POST",
			Headers = {
				["Content-Type"] = "application/json",
				["X-Golem-Token"] = token or "",
				["X-Golem-Plugin-Version"] = PLUGIN_VERSION,
				["X-Golem-Plugin-Protocol"] = PLUGIN_PROTOCOL,
			},
			Body = encoded,
		})
	end)
	if not requestedOk then
		return false, 0, nil
	end
	return parseResponse(response)
end

local function waitSeconds(waitMs: any): number
	local millis = tonumber(waitMs)
	if not millis or millis ~= millis or millis == math.huge or millis == -math.huge then
		return 1
	end
	return math.clamp(millis / 1000, MIN_WAIT_SECONDS, MAX_WAIT_SECONDS)
end

local function operationName(pending: any): string
	if type(pending) == "table" and type(pending.studioOp) == "table" and type(pending.studioOp.op) == "string" then
		return pending.studioOp.op
	end
	return "operation"
end

local function validPending(pending: any): boolean
	if type(pending) ~= "table" then
		return false
	end
	if type(pending.id) ~= "string" or #pending.id == 0 or #pending.id > 160 then
		return false
	end
	return type(pending.studioOp) == "table" and type(pending.studioOp.op) == "string"
end

local function resultForFailure(id: string): any
	return {
		id = id,
		ok = false,
		error = "Studio operation failed",
		failure = "internal",
	}
end

local function resultForExecution(config: Config, id: string, op: any, stillCurrent: () -> boolean): any
	local called, value = pcall(config.execute, id, op, stillCurrent)
	if not called or type(value) ~= "table" then
		return resultForFailure(id)
	end
	-- Copy only the shared OpResult fields.  In particular, never echo a callback's arbitrary
	-- fields back to the worker.  The requested id wins if an implementation returned a stale id.
	--
	-- THIS ALLOWLIST IS WHY A FIELD CAN EXIST AT BOTH ENDS AND STILL NOT ARRIVE.  `remedy` was added
	-- to Commands.luau and to the worker on the same evening, with tests at both ends, and it went
	-- nowhere: this loop dropped it silently, because dropping the unknown is exactly its job.  The
	-- symptom was the bug it was meant to fix, reproduced verbatim by a different agent minutes
	-- after the "fix" shipped.  A field added at two ends is not a field until the wire carries it.
	local result: any = { id = id, ok = value.ok == true }
	if value.data ~= nil then result.data = value.data end
	if type(value.error) == "string" then result.error = string.sub(value.error, 1, 1000) end
	if tonumber(value.durationMs) ~= nil then result.durationMs = value.durationMs end
	if type(value.failure) == "string" then result.failure = value.failure end
	-- Bounded like `error`, and left unvalidated against the vocabulary on purpose: the worker
	-- refuses a code it does not know (`isRefusalRemedyCode`) and says so, which is the honest
	-- answer for a plugin newer than the worker.  Validating here as well would turn "newer client"
	-- into "silently no remedy", which is the same silence this field exists to remove.
	if type(value.remedy) == "string" then result.remedy = string.sub(value.remedy, 1, 64) end
	return result
end

local function hasResult(session: Session, id: string): boolean
	return session.pendingResultIds[id] == true
end

local function queueResult(session: Session, result: any): boolean
	local id = result.id
	if type(id) ~= "string" or #id == 0 then
		return false
	end
	if hasResult(session, id) then
		return true
	end
	if #session.pendingResults >= MAX_RESULT_QUEUE then
		return false
	end
	table.insert(session.pendingResults, result)
	session.pendingResultIds[id] = true
	return true
end

local function remember(session: Session, id: string, result: any)
	if session.replay[id] ~= nil then
		return
	end
	-- preflightBatch guarantees this cannot overflow.  Keep the guard here too because it makes
	-- the invariant local to the write, should the batching code ever be changed.
	if #session.replayOrder >= MAX_REPLAY then
		return
	end
	session.replay[id] = result
	table.insert(session.replayOrder, id)
end

-- THE REPLAY MEMORY IS A WINDOW, NOT A LOG. It exists so an op id delivered twice runs once — which only
-- matters while its result is unacknowledged: once the server has taken the result it drops the op. It
-- used to keep every id for the whole session and END the session at MAX_REPLAY, so a customer doing
-- real work was disconnected mid-run — measured 2026-09-22 at 20:45 UTC, after four runs (~240 ops, one
-- of them a 149-op terrain build) on one pairing: "Apple sent too many operations to this Studio
-- session". Oldest acknowledged entries now make room; only a window of still-pending results can fill.
local function evictAcknowledged(session: Session, room: number)
	while #session.replayOrder > 0 and #session.replayOrder + room > MAX_REPLAY do
		local oldest = session.replayOrder[1]
		if hasResult(session, oldest) then
			break
		end
		table.remove(session.replayOrder, 1)
		session.replay[oldest] = nil
	end
end

local function pendingAdds(session: Session, ops: { [number]: any }): (boolean, number, number)
	if #ops > MAX_BATCH then
		return false, 0, 0
	end
	local newIds: { [string]: boolean } = {}
	local newReplay = 0
	local newResults = 0
	for index = 1, #ops do
		local pending = ops[index]
		if not validPending(pending) then
			return false, 0, 0
		end
		local id = pending.id
		if session.replay[id] == nil and not newIds[id] then
			newIds[id] = true
			newReplay += 1
			if not hasResult(session, id) then
				-- Count one result for each previously unseen id, including repeated ids in this batch
				-- only once.  A replay that is already pending is not appended a second time.
				newResults += 1
			end
		end
	end
	evictAcknowledged(session, newReplay)
	if #session.replayOrder + newReplay > MAX_REPLAY then
		return false, 0, 0
	end
	if #session.pendingResults + newResults > MAX_RESULT_QUEUE then
		return false, 0, 0
	end
	return true, newReplay, newResults
end

local function acknowledged(session: Session, sentCount: number)
	-- Results are a prefix: operations received from this response are appended only after the
	-- request returns.  Remove exactly what this request carried, leaving newer unsent results.
	for _ = 1, sentCount do
		local result = table.remove(session.pendingResults, 1)
		if result and type(result.id) == "string" then
			session.pendingResultIds[result.id] = nil
		end
	end
end

local function queueEvent(session: Session, event: any): boolean
	-- Selection is state, not a log.  Keep only the latest unsent value.  Never replace an event
	-- already referenced by an in-flight RequestAsync body: if the user clicks during the request,
	-- the new selection gets its own record and survives acknowledgement of the old one.
	if event.kind == "selection" then
		for index = #session.pendingEvents, 1, -1 do
			local record = session.pendingEvents[index]
			if not record.inFlight and record.event.kind == "selection" then
				session.nextEventSequence += 1
				record.sequence = session.nextEventSequence
				record.event = event
				return true
			end
		end
	end

	if #session.pendingEvents >= MAX_EVENT_QUEUE then
		-- Prefer discarding the oldest unsent event of the same kind.  This keeps the queue bounded
		-- while retaining the most recent diagnostic/selection.  In-flight records are immutable.
		local removeAt = nil
		for index, record in session.pendingEvents do
			if not record.inFlight and record.event.kind == event.kind then removeAt = index; break end
		end
		if not removeAt then
			for index, record in session.pendingEvents do
				if not record.inFlight then removeAt = index; break end
			end
		end
		if not removeAt then return false end
		table.remove(session.pendingEvents, removeAt)
	end

	session.nextEventSequence += 1
	table.insert(session.pendingEvents, { sequence = session.nextEventSequence, event = event, inFlight = false })
	return true
end

local function eventsForPoll(session: Session): ({ any }, { number })
	local events = {}
	local sequences = {}
	for _, record in session.pendingEvents do
		record.inFlight = true
		table.insert(events, record.event)
		table.insert(sequences, record.sequence)
	end
	return events, sequences
end

local function releaseEvents(session: Session, sequences: { number })
	local sent = {}
	for _, sequence in sequences do sent[sequence] = true end
	for _, record in session.pendingEvents do
		if sent[record.sequence] then record.inFlight = false end
	end
end

local function acknowledgeEvents(session: Session, sequences: { number })
	local sent = {}
	for _, sequence in sequences do sent[sequence] = true end
	for index = #session.pendingEvents, 1, -1 do
		if sent[session.pendingEvents[index].sequence] then table.remove(session.pendingEvents, index) end
	end
end

local function isTerminalResponse(body: any, token: string): (boolean, string?)
	if type(body) ~= "table" then
		return false, nil
	end
	if body.detach == true then
		return true, "Apple ended this Studio session. Pair again to reconnect."
	end
	local client = body.client
	if type(client) == "table" and client.compatible == false then
		return true, safeRemoteMessage(client.message, token, "This Apple Studio plugin is not compatible with the server. Update the plugin.")
	end
	-- Keep this tolerant of a small server-side envelope change while still refusing before any
	-- operation is run.  The worker's current shape is { client = { compatible: false } }.
	if body.compatible == false then
		return true, safeRemoteMessage(body.message, token, "This Apple Studio plugin is not compatible with the server. Update the plugin.")
	end
	if body.placeMismatch ~= nil then
		local mismatch = body.placeMismatch
		if type(mismatch) == "table" then
			return true, safeRemoteMessage(
				mismatch.message,
				token,
				"Studio has a different place open. Switch to the paired place, then pair again if needed."
			)
		end
		return true, "Studio has a different place open. Switch to the paired place, then pair again if needed."
	end
	return false, nil
end

local function readCapabilities(config: Config): any?
	if type(config.capabilities) ~= "function" then return nil end
	local ok, value = pcall(config.capabilities)
	if not ok or type(value) ~= "table" then return nil end
	return value
end

local function newSession(token: string, projectName: string, generation: number, capabilities: any?): Session
	return {
		token = token,
		projectName = projectName,
		generation = generation,
		pendingResults = {},
		pendingResultIds = {},
		replay = {},
		replayOrder = {},
		pendingEvents = {},
		nextEventSequence = 0,
		capabilities = capabilities,
		capabilitiesPending = capabilities ~= nil,
		assetSourcesOwed = false,
	}
end

local function current(self: BridgeObject, session: Session): boolean
	return not self.destroyed and self.connected and self.generation == session.generation and self.session == session
end

local function pollLoop(self: BridgeObject, session: Session)
	while current(self, session) do
		local observed, state = readState(self.config)
		if not current(self, session) then return end
		if not observed then
			self:_end("Studio state is unavailable. Reopen the place and reconnect.")
			return
		end
				local outbound: { [any]: any } = {
					results = session.pendingResults,
					state = state,
					assetSourcesPrompt = true,
				}
				if session.capabilitiesPending and session.capabilities ~= nil then
					outbound.capabilities = session.capabilities
				end
				local sentCount = #session.pendingResults
				-- The person's asset-source answer rides every poll until one is acknowledged.
				local sentAnswer = session.assetSourcesAnswer
				if sentAnswer ~= nil then outbound.assetSourcesAnswer = sentAnswer end
			local sentEvents, sentEventSequences = eventsForPoll(session)
			if #sentEvents > 0 then outbound.events = sentEvents end

			local ok, statusCode, body = post(POLL_URL, outbound, session.token)
		-- RequestAsync yields.  A user disconnect or a replacement connect may have retired this
		-- loop while it was away; no response from the retired generation may mutate Studio.
		if not current(self, session) then
			return
		end

			if statusCode == 401 or statusCode == 403 then
				releaseEvents(session, sentEventSequences)
				self:_end(statusFromAuth(body, session.token))
				return
			end
				if not ok or type(body) ~= "table" then
				releaseEvents(session, sentEventSequences)
				session.retrying = true
				callStatus(self.config, "Connection hiccup — retrying…")
			task.wait(RETRY_WAIT_SECONDS)
			if not current(self, session) then return end
					continue
				end
				session.capabilitiesPending = false
				-- A successful poll is not necessarily a saved answer. Retry only a transient
				-- worker failure; a policy refusal needs a new choice from the person.
				local sourcesReply = body.assetSources
				local retryAnswer = type(sourcesReply) == "table" and sourcesReply.owed == true
					and sourcesReply.retryable == true
				if not retryAnswer and session.assetSourcesAnswer == sentAnswer then
					session.assetSourcesAnswer = nil
				end

				-- HTTP success is the acknowledgement for the result prefix.  This happens before looking
			-- at terminal flags: a server may have accepted the result and then requested a detach.
			acknowledged(session, sentCount)
			acknowledgeEvents(session, sentEventSequences)
		if session.retrying then
			-- The hiccup text is otherwise the last word for the rest of the session (round 7).
			session.retrying = false
			callStatus(self.config, "Connected · " .. session.projectName)
			if not current(self, session) then return end
		end
		local terminal, terminalMessage = isTerminalResponse(body, session.token)
		if terminal then
			self:_end(terminalMessage or "Session ended")
			return
		end

		-- F-059: the worker says whether a build is waiting on the asset-source answer. The dock hears
		-- only a change, or a sentence about an answer it could not store.
		local sources = body.assetSources
		local owed = type(sources) == "table" and sources.owed == true
		local note = if type(sources) == "table" and sources.message ~= nil
			then safeRemoteMessage(sources.message, session.token, "Apple could not save that answer. Try again.")
			else nil
		if (owed ~= session.assetSourcesOwed or note ~= nil) and type(self.config.onAssetSources) == "function" then
			session.assetSourcesOwed = owed
			pcall(self.config.onAssetSources :: any, { owed = owed, message = note })
			if not current(self, session) then return end
		end

		local ops = body.ops
		if ops == nil then
			ops = {}
		end
		if type(ops) ~= "table" then
			self:_end("Apple sent an invalid operation batch. Reconnect to try again.")
			return
		end
		local safeBatch = pendingAdds(session, ops)
		if not safeBatch then
			-- Refuse the complete batch, rather than executing a prefix and leaving the rest with no
			-- safe result slot or replay entry.  Ending this generation prevents a malformed server
			-- response from being retried into an ever-growing client state.
			self:_end("Apple sent too many operations to this Studio session. Reconnect to try again.")
			return
		end

		-- A terminal callback could have fired while status was rendered in a host application;
		-- check before touching the first operation and again after every callback/execution.
		for index = 1, #ops do
			if not current(self, session) then return end
			local pending = ops[index]
			local id = pending.id
			local name = operationName(pending)
			callActivity(self.config, "▸ " .. name)
			if not current(self, session) then return end

				local result = session.replay[id]
				if result == nil then
					result = resultForExecution(self.config, id, pending.studioOp, function()
						return current(self, session)
					end)
				-- Store the replay result before any next operation.  If delivery is retried, this id
				-- is answered from memory and never reaches execute a second time.
				remember(session, id, result)
			end
			if not queueResult(session, result) then
				self:_end("Apple could not safely queue an operation result. Reconnect to try again.")
				return
			end
			callActivity(self.config, (result.ok == true and "✓ " or "✗ ") .. name)
			-- execute may yield and the host may disconnect during it.  Do not continue into the next
			-- mutation after that generation fence changes; the result already remains queued in memory.
			if not current(self, session) then return end
		end

		local waitMs = body.waitMs
		if #ops > 0 then
			task.wait(MIN_WAIT_SECONDS)
		else
			task.wait(waitSeconds(waitMs))
		end
		if not current(self, session) then return end
	end
end

function Bridge:_end(message: string?)
	-- Retire first.  Host callbacks often read isConnected() to clear permissions, and must see the
	-- new truth rather than the old session while the status text is being delivered.
	self.generation += 1
	self.connected = false
	self.session = nil
	if message then
		callStatus(self.config, message)
	end
end

function Bridge.new(config: Config): BridgeObject
	assert(type(config) == "table", "Bridge.new requires a config table")
	assert(type(config.execute) == "function", "Bridge.new requires execute")
	assert(type(config.state) == "function", "Bridge.new requires state")
	assert(type(config.onStatus) == "function", "Bridge.new requires onStatus")
	assert(type(config.onActivity) == "function", "Bridge.new requires onActivity")

	local self = setmetatable({
		config = config,
		connected = false,
		destroyed = false,
		generation = 0,
		session = nil,
		unloadingConnection = nil,
	}, Bridge) :: any

	-- Plugin.Unloading is the only lifecycle hook this transport needs.  It is optional in tests and
	-- in hosts that call destroy explicitly; neither path persists a credential or kills a thread.
	local unloading = config.plugin and config.plugin.Unloading
	if unloading and type(unloading.Connect) == "function" then
		local connectedOk, connection = pcall(function()
			return unloading:Connect(function()
				self:destroy()
			end)
		end)
		if connectedOk then
			self.unloadingConnection = connection
		end
	end
	return self
end

function Bridge:connect(code: string): (boolean, string)
	if self.destroyed then
		return false, "This Studio connection is no longer available."
	end
	if type(code) ~= "string" then
		return false, "Enter the pairing code from your Apple project."
	end
	local normalized = string.upper(string.gsub(code, "[^A-Za-z0-9]", ""))
	if #normalized == 0 or #normalized > MAX_CODE_CHARS then
		return false, "Enter the pairing code from your Apple project."
	end

	-- A replacement connection retires the old loop before the claim request yields.  The attempt
	-- generation is checked again after the claim returns, so two clicks cannot resurrect an older
	-- request after a later disconnect/destroy.
	self.generation += 1
	self.connected = false
	self.session = nil
	callStatus(self.config, "Connecting…")
	local attemptGeneration = self.generation
	local observedState, currentState = readState(self.config)
	if not observedState then
		local message = "Studio state is unavailable. Reopen the place and reconnect."
		callStatus(self.config, message)
		return false, message
	end
	if self.destroyed or self.generation ~= attemptGeneration then
		return false, "Connection attempt was cancelled."
	end
	local place: any = nil
	if type(currentState) == "table" then
		place = {
			placeId = currentState.placeId,
			gameId = currentState.gameId,
			placeName = currentState.placeName,
		}
	end
	local claimBody: any = { code = normalized }
	if place ~= nil then claimBody.place = place end
	local ok, statusCode, body = post(CLAIM_URL, claimBody, nil)
	if self.destroyed or self.generation ~= attemptGeneration then
		return false, "Connection attempt was cancelled."
	end
	if not ok or type(body) ~= "table" or type(body.token) ~= "string" or #body.token == 0 or #body.token > MAX_TOKEN_CHARS then
		local message = if statusCode == 404
			then "Invalid or expired pairing code."
			else "Could not reach Apple — check Studio’s network permission."
		callStatus(self.config, message)
		return false, message
	end
	if type(body.projectId) ~= "string" or #body.projectId == 0 then
		local message = "Apple returned an invalid pairing response."
		callStatus(self.config, message)
		return false, message
	end

	local projectName = if type(body.projectName) == "string" and #body.projectName > 0
		then string.sub(body.projectName, 1, 160)
		else "Apple project"
		-- Capabilities are sampled once for THIS pairing and retried on every failed poll until one
		-- valid poll response acknowledges them.  They never live on Bridge itself, so reconnecting
		-- cannot inherit a previous Studio session's report.
		local session = newSession(body.token, projectName, attemptGeneration, readCapabilities(self.config))
	self.session = session
	self.connected = true
	local connectedMessage = "Connected · " .. projectName
	callStatus(self.config, connectedMessage)
	task.spawn(function()
		pollLoop(self, session)
	end)
	return true, connectedMessage
end

function Bridge:disconnect()
	if self.destroyed then return end
	self:_end("Disconnected")
end

function Bridge:destroy()
	if self.destroyed then return end
	self.destroyed = true
	self:_end(nil)
	local connection = self.unloadingConnection
	self.unloadingConnection = nil
	if connection and type(connection.Disconnect) == "function" then
		pcall(function() connection:Disconnect() end)
	end
end

function Bridge:isConnected(): boolean
	return self.connected and not self.destroyed and self.session ~= nil
end

function Bridge:pushEvent(value: any): boolean
	local session = self.session
	if not session or not current(self, session) then return false end
	local event = safeEvent(value)
	if not event then return false end
	return queueEvent(session, event)
end

-- The person's explicit consent to add free Roblox assets, sent on the next poll. Only a bounded
-- list of source names crosses; the worker keeps the choices it knows and refuses the rest.
function Bridge:answerAssetSources(allow: any): boolean
	local session = self.session
	if not session or not current(self, session) then return false end
	if type(allow) ~= "table" or #allow == 0 or #allow > 8 then return false end
	local picked = {}
	for _, choice in allow do
		if type(choice) ~= "string" or #choice == 0 or #choice > 64 then return false end
		table.insert(picked, choice)
	end
	session.assetSourcesAnswer = { allow = picked }
	return true
end

return Bridge
