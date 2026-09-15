--!strict
--[[
	AppleClient — the Apple API from inside Roblox Studio.

	WHAT THIS IS FOR. The shipped plugin (apps/plugin/src/init.server.luau) talks to the
	worker through a `post` helper welded into the middle of a 415-line UI script: it cannot
	be required, cannot be tested, and cannot be reused by a second tool. This module is that
	same conversation, extracted, hardened, and callable — a Studio plugin, a command bar
	snippet or a test harness all get the same client.

	IT IS THE SAME PROTOCOL, NOT A SECOND ONE. The routes, the `X-Golem-` header family and
	the `<projectId>.<48 hex>` token shape come from apps/worker/src/index.ts. Nothing here
	invents an endpoint.

	WHY HttpService IS INJECTABLE. `Client.new{ http = ... }` takes anything with
	`RequestAsync`, `JSONEncode` and `JSONDecode`. Not for elegance: the interesting cases
	are a body that is not JSON, a 401 in the middle of a poll loop, and a `waitMs` that is a
	string — none of which a live worker will produce on request. Injection is what lets the
	test hand them over directly. In Studio, omit it and the real service is used.
]]

local Client = {}
Client.__index = Client

Client.DEFAULT_API = "https://golem.moshe-barami111.workers.dev"

-- Header names are wire identity. Never rename these; an already-installed plugin updates
-- only when a user clicks Update, so a rename locks out every existing install indefinitely.
Client.HEADER_TOKEN = "X-Golem-Token"
Client.HEADER_PLUGIN_VERSION = "X-Golem-Plugin-Version"
Client.HEADER_PLUGIN_PROTOCOL = "X-Golem-Plugin-Protocol"

export type Http = {
	RequestAsync: (self: any, options: any) -> any,
	JSONEncode: (self: any, value: any) -> string,
	JSONDecode: (self: any, text: string) -> any,
}

export type Options = {
	apiBase: string?,
	token: string?,
	version: string?,
	protocol: number?,
	http: Http?,
}

export type Response = { ok: boolean, status: number, data: any, error: string? }

-- ---------------------------------------------------------------- admission --

--[[ A finite number inside [min, max], or the fallback.

	 THE POINT IS THAT `or` IS NOT THIS. `data.waitMs or 2000` — what the shipped plugin
	 does — accepts a string, a table, and NaN. The value then reaches
	 `math.clamp(waitMs / 1000, ...)`: a string raises inside the poll loop and kills it,
	 and NaN loses every comparison it takes part in, so the clamp that looks like a bound
	 stops being one and says nothing while it happens. ]]
function Client.finiteNumber(value: any, fallback: number, min: number?, max: number?): number
	if type(value) ~= "number" then
		return fallback
	end
	local n = value :: number
	-- NaN is the only value not equal to itself; math.huge is finite-looking and is not.
	if n ~= n or n == math.huge or n == -math.huge then
		return fallback
	end
	if min and n < min then
		return min
	end
	if max and n > max then
		return max
	end
	return n
end

--- True for the project id shape the worker's own UUID_RE admits.
function Client.isProjectId(value: any): boolean
	if type(value) ~= "string" then
		return false
	end
	local s = value :: string
	if #s ~= 36 then
		return false
	end
	return string.match(s, "^%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x$") ~= nil
end

--[[ True for the pairing token the worker issues: `<projectId>.<48 lower-case hex>`.

	 The worker checks this shape BEFORE it touches storage, so that an unauthenticated
	 caller cannot materialise a Durable Object for an arbitrary id. Checking it here is not
	 duplication for its own sake: a malformed token earns a 401 that is indistinguishable
	 from an expired pairing, and a client that cannot tell those apart reconnects forever. ]]
function Client.isStudioToken(value: any): boolean
	if type(value) ~= "string" then
		return false
	end
	local s = value :: string
	if #s > 200 then
		return false
	end
	local id, secret = string.match(s, "^([^%.]+)%.([0-9a-f]+)$")
	if id == nil or secret == nil then
		return false
	end
	return #(secret :: string) == 48 and Client.isProjectId(id)
end

--[[ `/api/projects/<id><suffix>`, with the id validated first.

	 An unvalidated id is a path-traversal primitive: `../../admin/stats` turns a project
	 read into an admin read once the URL is normalised. ]]
function Client.projectPath(projectId: any, suffix: string?): string
	if not Client.isProjectId(projectId) then
		error(string.format("invalid project id: %s (expected a UUID)", tostring(projectId)), 2)
	end
	return "/api/projects/" .. (projectId :: string) .. (suffix or "")
end

--- Seconds to wait before the next poll. See finiteNumber for why this is not `or`.
function Client.pollWaitSeconds(data: any, fallback: number?): number
	local raw: any = nil
	if type(data) == "table" then
		raw = (data :: any).waitMs
	end
	local ms = Client.finiteNumber(raw, (fallback or 2) * 1000, 200, 10000)
	return ms / 1000
end

--- Whether an attempt may be repeated. A POST is never repeated unless asked for.
function Client.shouldRetry(method: string, status: number, attempt: number, maxAttempts: number): boolean
	local n = Client.finiteNumber(attempt, 0)
	local cap = Client.finiteNumber(maxAttempts, 0)
	if n < 1 or cap < 1 or n >= cap then
		return false
	end
	local verb = string.upper(method)
	if verb ~= "GET" and verb ~= "PUT" and verb ~= "HEAD" and verb ~= "DELETE" then
		return false
	end
	if status == 0 then
		return true
	end
	for _, retryable in { 408, 425, 429, 500, 502, 503, 504 } do
		if status == retryable then
			return true
		end
	end
	return false
end

--- Exponential backoff in seconds, capped. Deterministic: Studio has no jitter budget.
function Client.backoffSeconds(attempt: number): number
	local n = Client.finiteNumber(attempt, 1, 1, 10)
	return math.min(20, 0.3 * 2 ^ (n - 1))
end

-- ------------------------------------------------------------------ client --

function Client.new(options: Options?): any
	local o: Options = options or {}
	local http = o.http
	if http == nil then
		-- Resolved lazily and defensively: outside Studio there is no `game` at all, and a
		-- module that raised at require time could not be unit tested.
		local ok, service = pcall(function()
			return (game :: any):GetService("HttpService")
		end)
		http = if ok then service else nil
	end
	return setmetatable({
		apiBase = o.apiBase or Client.DEFAULT_API,
		token = o.token,
		version = o.version,
		protocol = o.protocol,
		http = http,
	}, Client)
end

--[[ Identity headers, sent on EVERY request including the pairing call.

	 On headers rather than in the body because the server needs to know what it is talking
	 to before it parses anything, and `/api/studio/claim` has no body field for them. A
	 client that reports nothing simply omits two headers, which is indistinguishable at the
	 HTTP layer from any other client and needs no special case on either side. ]]
function Client:headers(extra: { [string]: string }?): { [string]: string }
	local out: { [string]: string } = { ["Content-Type"] = "application/json" }
	if self.version ~= nil then
		out[Client.HEADER_PLUGIN_VERSION] = tostring(self.version)
	end
	if self.protocol ~= nil then
		out[Client.HEADER_PLUGIN_PROTOCOL] = tostring(self.protocol)
	end
	for key, value in (extra or {}) do
		out[key] = value
	end
	return out
end

--[[ One request. Never raises: returns a Response.

	 EVERY FAILURE IS A VALUE, not an error. This is called from a poll loop that must keep
	 running; a raise from inside `RequestAsync` or `JSONDecode` — a DNS failure, an HTML
	 error page from an edge — would kill the loop, and in Studio that reads to the user as
	 the plugin having silently stopped working. ]]
function Client:request(method: string, path: string, body: any?, extraHeaders: { [string]: string }?): Response
	if self.http == nil then
		return { ok = false, status = 0, data = nil, error = "no HttpService available" }
	end
	local encoded: string? = nil
	if body ~= nil then
		local encodeOk, encodedBody = pcall(function()
			return self.http:JSONEncode(body)
		end)
		if not encodeOk then
			return { ok = false, status = 0, data = nil, error = "could not encode the request body" }
		end
		encoded = encodedBody
	end

	local ok, res = pcall(function()
		return self.http:RequestAsync({
			Url = self.apiBase .. path,
			Method = string.upper(method),
			Headers = self:headers(extraHeaders),
			Body = encoded,
		})
	end)
	if not ok then
		return { ok = false, status = 0, data = nil, error = tostring(res) }
	end

	local response = res :: any
	local parsed: any = nil
	-- A body that is not JSON is NORMAL on an error path: an edge answers 502 with HTML.
	pcall(function()
		parsed = self.http:JSONDecode(response.Body)
	end)
	local status = Client.finiteNumber(response.StatusCode, 0)
	local success = response.Success == true
	local message: string? = nil
	if not success then
		if type(parsed) == "table" and type((parsed :: any).error) == "string" then
			message = (parsed :: any).error
		else
			message = string.format("Request failed (%d)", status)
		end
	end
	return { ok = success, status = status, data = parsed, error = message }
end

--- Redeem a pairing code. Stores the token on success.
function Client:claim(code: string): Response
	if type(code) ~= "string" or code == "" then
		return { ok = false, status = 0, data = nil, error = "a pairing code is required" }
	end
	local res = self:request("POST", "/api/studio/claim", { code = code })
	if res.ok and type(res.data) == "table" and type((res.data :: any).token) == "string" then
		self.token = (res.data :: any).token
	elseif res.ok then
		return { ok = false, status = res.status, data = res.data, error = "pairing returned no token" }
	end
	return res
end

--[[ One long poll.

	 A 401 ENDS THE SESSION. It means the pairing was superseded or expired, and every later
	 poll with the same token answers the same way — so it is reported with `detach` and the
	 dead token is dropped, rather than being treated as a hiccup the loop can spin on. ]]
function Client:poll(payload: any?): Response & { detach: boolean }
	if not Client.isStudioToken(self.token) then
		return { ok = false, status = 0, data = nil, error = "not paired — call claim() first", detach = true }
	end
	local body = payload or {}
	if body.results == nil then
		body.results = {}
	end
	if body.events == nil then
		body.events = {}
	end
	local res = self:request("POST", "/api/studio/poll", body, { [Client.HEADER_TOKEN] = self.token })
	local detach = res.status == 401
	if detach then
		self.token = nil
	end
	if res.ok and type(res.data) == "table" and (res.data :: any).detach == true then
		detach = true
	end
	return {
		ok = res.ok,
		status = res.status,
		data = res.data,
		error = if detach and not res.ok then "Session ended — reconnect with a new code" else res.error,
		detach = detach,
	}
end

--- Ops from a poll response, always a table — never nil for a caller to iterate.
function Client.opsFrom(data: any): { any }
	if type(data) ~= "table" or type((data :: any).ops) ~= "table" then
		return {}
	end
	return (data :: any).ops
end

return Client
