--!nocheck
-- AppleClient's own spec. Loaded by ../../tests/luau.test.mjs, which concatenates a
-- prelude (a scripted HttpService), this module's source VERBATIM, and this file into one
-- chunk for the standalone Luau CLI. What is tested is what ships.

local Client = __MODULE
local h = __HARNESS

local PROJECT = "3f2a1c9e-77b4-4c2a-9a1e-0b8d6e4f1234"
local SECRET = string.rep("a", 48)
local TOKEN = PROJECT .. "." .. SECRET

-- A scripted HttpService. Each entry is `{ Success, StatusCode, Body }`, handed out in
-- order, and every request is recorded so a spec can assert on what was actually sent.
local function fakeHttp(responses)
	local sent = {}
	local n = 0
	local http = {
		sent = sent,
		JSONEncode = function(_self, value)
			-- Deliberately minimal: the specs assert on the TABLE that was passed, not on
			-- byte-exact JSON, so this only has to be lossless enough to travel.
			return "<encoded>"
		end,
		JSONDecode = function(_self, text)
			if text == nil or string.sub(text, 1, 1) ~= "{" then
				error("Can't parse JSON")
			end
			-- The prelude only ever needs these two shapes back.
			if string.find(text, '"ops"', 1, true) then
				return { ops = { { id = "o1", seq = 1, studioOp = { op = "create" } } }, waitMs = 500 }
			end
			if string.find(text, '"token"', 1, true) then
				return { token = TOKEN, projectId = PROJECT, projectName = "Tower" }
			end
			if string.find(text, '"error"', 1, true) then
				return { error = "invalid token" }
			end
			return {}
		end,
		RequestAsync = function(_self, options)
			table.insert(sent, options)
			n += 1
			local r = responses[math.min(n, #responses)]
			if r.raise then
				error("HttpService: dns failure")
			end
			return { Success = r.Success, StatusCode = r.StatusCode, Body = r.Body, StatusMessage = r.StatusMessage or "" }
		end,
	}
	return http
end

-- ------------------------------------------------------------------ admission

h.test("finiteNumber refuses every shape `or` would have accepted", function()
	h.eq(Client.finiteNumber(500, 2000), 500)
	h.eq(Client.finiteNumber("5000", 2000), 2000, "a numeric string is not a number")
	h.eq(Client.finiteNumber(0 / 0, 2000), 2000, "NaN")
	h.eq(Client.finiteNumber(math.huge, 2000), 2000, "infinity")
	h.eq(Client.finiteNumber(nil, 2000), 2000)
	h.eq(Client.finiteNumber({}, 2000), 2000)
	h.eq(Client.finiteNumber(0, 2000), 0, "a real zero is a real value")
end)

h.test("pollWaitSeconds never returns something task.wait cannot use", function()
	h.eq(Client.pollWaitSeconds({ waitMs = 500 }), 0.5)
	h.eq(Client.pollWaitSeconds({ waitMs = "5000" }), 2)
	h.eq(Client.pollWaitSeconds({ waitMs = 0 / 0 }), 2)
	h.eq(Client.pollWaitSeconds({ waitMs = math.huge }), 2)
	h.eq(Client.pollWaitSeconds({}), 2)
	h.eq(Client.pollWaitSeconds(nil), 2)
	h.eq(Client.pollWaitSeconds("not a table"), 2)
	h.eq(Client.pollWaitSeconds({ waitMs = 0 }), 0.2, "zero would be a spin; the floor holds")
	h.eq(Client.pollWaitSeconds({ waitMs = -5 }), 0.2)
	h.eq(Client.pollWaitSeconds({ waitMs = 999999 }), 10, "the ceiling holds")
end)

h.test("isProjectId admits exactly the worker's shape", function()
	h.eq(Client.isProjectId(PROJECT), true)
	h.eq(Client.isProjectId(string.upper(PROJECT)), true)
	h.eq(Client.isProjectId("../../admin/stats"), false)
	h.eq(Client.isProjectId("not-a-uuid"), false)
	h.eq(Client.isProjectId(PROJECT .. "/messages"), false)
	h.eq(Client.isProjectId(nil), false)
	h.eq(Client.isProjectId(42), false)
end)

h.test("projectPath raises on an id that could escape the path", function()
	h.eq(Client.projectPath(PROJECT, "/messages"), "/api/projects/" .. PROJECT .. "/messages")
	h.raises(function()
		Client.projectPath("../../admin/stats", "/messages")
	end, "invalid project id")
end)

h.test("isStudioToken admits exactly the token the worker issues", function()
	h.eq(Client.isStudioToken(TOKEN), true)
	h.eq(Client.isStudioToken(PROJECT .. "." .. string.rep("a", 47)), false, "one short")
	h.eq(Client.isStudioToken(PROJECT .. "." .. string.rep("A", 48)), false, "lower-case hex only")
	h.eq(Client.isStudioToken("not-a-uuid." .. SECRET), false)
	h.eq(Client.isStudioToken(SECRET), false, "no project prefix")
	h.eq(Client.isStudioToken(nil), false)
end)

h.test("a POST is not retried; a GET on a transient status is", function()
	h.eq(Client.shouldRetry("GET", 503, 1, 3), true)
	h.eq(Client.shouldRetry("POST", 503, 1, 3), false, "repeating a POST repeats its effect")
	h.eq(Client.shouldRetry("GET", 404, 1, 3), false)
	h.eq(Client.shouldRetry("GET", 503, 3, 3), false, "the cap holds")
	h.eq(Client.shouldRetry("GET", 503, 0 / 0, 3), false, "an unreadable counter refuses")
end)

h.test("backoff grows and is capped", function()
	local previous = 0
	for attempt = 1, 10 do
		local wait = Client.backoffSeconds(attempt)
		h.ok(wait >= previous, "attempt " .. attempt .. " waited less than the one before")
		h.ok(wait <= 20, "the ceiling must hold")
		previous = wait
	end
	h.ok(Client.backoffSeconds(2) > Client.backoffSeconds(1), "the schedule must actually grow")
end)

-- -------------------------------------------------------------------- requests

h.test("every request carries the plugin identity on headers", function()
	local http = fakeHttp({ { Success = true, StatusCode = 200, Body = "{}" } })
	local client = Client.new({ apiBase = "https://api.test", http = http, version = "0.2.0", protocol = 1 })
	client:request("GET", "/api/health")
	local sent = http.sent[1]
	h.eq(sent.Url, "https://api.test/api/health")
	h.eq(sent.Headers[Client.HEADER_PLUGIN_VERSION], "0.2.0")
	h.eq(sent.Headers[Client.HEADER_PLUGIN_PROTOCOL], "1")
end)

h.test("a client that reports no version simply omits the headers", function()
	local http = fakeHttp({ { Success = true, StatusCode = 200, Body = "{}" } })
	Client.new({ apiBase = "https://api.test", http = http }):request("GET", "/api/health")
	h.eq(http.sent[1].Headers[Client.HEADER_PLUGIN_VERSION], nil)
	h.eq(http.sent[1].Headers[Client.HEADER_PLUGIN_PROTOCOL], nil)
end)

h.test("a transport failure is a value, not a raise that would kill the poll loop", function()
	local http = fakeHttp({ { raise = true } })
	local res = Client.new({ apiBase = "https://api.test", http = http }):request("GET", "/api/health")
	h.eq(res.ok, false)
	h.eq(res.status, 0)
	h.ok(res.error ~= nil, "the reason must survive")
end)

h.test("a body that is not JSON does not raise — an edge answers 502 with HTML", function()
	local http = fakeHttp({ { Success = false, StatusCode = 502, Body = "<html>502 Bad Gateway</html>" } })
	local res = Client.new({ apiBase = "https://api.test", http = http }):request("GET", "/api/health")
	h.eq(res.ok, false)
	h.eq(res.status, 502)
	h.eq(res.data, nil, "nothing was parsed, and nothing pretends to have been")
	h.eq(res.error, "Request failed (502)")
end)

h.test("claim stores the token it was issued", function()
	local http = fakeHttp({ { Success = true, StatusCode = 200, Body = '{"token":"x"}' } })
	local client = Client.new({ apiBase = "https://api.test", http = http })
	local res = client:claim("GLM-7F3K2Q")
	h.eq(res.ok, true)
	h.eq(client.token, TOKEN)
	h.eq(http.sent[1].Url, "https://api.test/api/studio/claim")
end)

h.test("a pairing that returns no token leaves the client unpaired", function()
	local http = fakeHttp({ { Success = true, StatusCode = 200, Body = "{}" } })
	local client = Client.new({ apiBase = "https://api.test", http = http })
	local res = client:claim("GLM-7F3K2Q")
	h.eq(res.ok, false)
	h.eq(client.token, nil, "a client must not believe it is paired when it is not")
end)

h.test("polling before pairing refuses instead of sending an empty token", function()
	local http = fakeHttp({ { Success = true, StatusCode = 200, Body = '{"ops":[]}' } })
	local res = Client.new({ apiBase = "https://api.test", http = http }):poll()
	h.eq(res.ok, false)
	h.eq(res.detach, true)
	h.eq(#http.sent, 0, "no request left the client")
end)

h.test("a poll carries the token header and hands back its ops", function()
	local http = fakeHttp({ { Success = true, StatusCode = 200, Body = '{"ops":[]}' } })
	local client = Client.new({ apiBase = "https://api.test", http = http, token = TOKEN })
	local res = client:poll({ results = {}, events = {} })
	h.eq(res.ok, true)
	h.eq(res.detach, false)
	h.eq(http.sent[1].Headers[Client.HEADER_TOKEN], TOKEN)
	h.eq(#Client.opsFrom(res.data), 1)
	h.eq(Client.pollWaitSeconds(res.data), 0.5)
end)

h.test("a 401 detaches and drops the dead token, so the loop cannot spin on it", function()
	local http = fakeHttp({ { Success = false, StatusCode = 401, Body = '{"error":"invalid token"}' } })
	local client = Client.new({ apiBase = "https://api.test", http = http, token = TOKEN })
	local res = client:poll()
	h.eq(res.ok, false)
	h.eq(res.detach, true)
	h.eq(client.token, nil)
	h.ok(string.find(res.error, "reconnect", 1, true) ~= nil, "the message must say what to do")
end)

h.test("opsFrom is always iterable, whatever the server sent", function()
	h.eq(#Client.opsFrom(nil), 0)
	h.eq(#Client.opsFrom({}), 0)
	h.eq(#Client.opsFrom({ ops = "not a list" }), 0)
	h.eq(#Client.opsFrom("garbage"), 0)
end)

h.report("AppleClient")
