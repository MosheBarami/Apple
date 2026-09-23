--!strict
-- Backdoor scan and script strip for Roblox model files (D-MODELLIB-1). Run with Lune 0.10:
--
--   lune run packages/asset-library/models/scan-rbx.luau <jobs.json> <report.json>
--
-- jobs.json is a JSON array of { "in": path, "out": path, "keepScripts": bool }. Every job parses the
-- file with rbx-dom (the binary .rbxm/.rbxl and the XML .rbxmx/.rbxlx formats), lists every
-- LuaSourceContainer with the backdoor patterns its source contains, and writes a copy with every
-- script removed to "out". "keepScripts" is only ever set for an official Roblox kit, and even then
-- the findings are reported. A file that will not parse is reported as an error and nothing is
-- written for it: an unreadable file is never scored as clean.
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")
local Vector3 = roblox.Vector3

-- Patterns that free-model backdoors use. Codes, not excerpts: the report must not carry the Luau.
local PATTERNS: { { string } } = {
	{ "require_id", "require%s*%(%s*%d+" },
	{ "require_id_expr", "require%s*%(%s*[%w_%.]*%s*[%+%-%*/]" },
	{ "getfenv", "getfenv" },
	{ "setfenv", "setfenv" },
	{ "loadstring", "loadstring" },
	{ "http", "HttpService" },
	{ "http_call", ":%s*[GP][eo][ts]t?Async%s*%(" },
	{ "insert_service", "InsertService" },
	{ "marketplace", "MarketplaceService" },
	{ "teleport", "TeleportService" },
	{ "string_char", "string%.char" },
	{ "string_reverse", "string%.reverse" },
	{ "byte_escapes", "\\%d%d%d?\\%d%d%d?\\%d%d%d?" },
	{ "hex_escapes", "\\x%x%x\\x%x%x" },
	{ "kick", ":Kick%s*%(" },
	{ "global_env", "_G%s*[%.%[]" },
	{ "vararg_env", "getgenv" },
	{ "server_side", "ServerScriptService" },
}

local function findings(source: string): { string }
	local out = {}
	for _, p in PATTERNS do
		if string.find(source, p[2]) then table.insert(out, p[1]) end
	end
	-- A very long line is how obfuscators pack a payload.
	for line in string.gmatch(source, "[^\n]+") do
		if #line > 2000 then
			table.insert(out, "long_line")
			break
		end
	end
	return out
end

local function fullName(inst: any, root: any): string
	local parts = {}
	local node = inst
	while node and node ~= root do
		table.insert(parts, 1, node.Name)
		node = node.Parent
	end
	return table.concat(parts, ".")
end

local function roots(path: string, bytes: string): { any }
	-- fetch.mjs renames the download to "<name>.rbxl.raw" before the scan, so the suffix is ignored.
	local lower = string.lower((string.gsub(path, "%.raw$", "")))
	if string.sub(lower, -5) == ".rbxl" or string.sub(lower, -6) == ".rbxlx" then
		local game = roblox.deserializePlace(bytes)
		local out = {}
		local ws = game:FindFirstChildOfClass("Workspace")
		if ws then
			for _, c in ws:GetChildren() do
				if not c:IsA("Camera") and not c:IsA("Terrain") then table.insert(out, c) end
			end
		end
		for _, svc in { "ReplicatedStorage", "ServerStorage", "Lighting" } do
			local s = game:FindFirstChild(svc)
			if s then
				for _, c in s:GetChildren() do
					if c:IsA("Model") or c:IsA("BasePart") or c:IsA("Folder") then table.insert(out, c) end
				end
			end
		end
		return out
	end
	return roblox.deserializeModel(bytes)
end

local function scan(job: any): any
	local bytes = fs.readFile(job["in"])
	local list = roots(job["in"], bytes)
	local report: any = {
		file = job["in"],
		roots = #list,
		instances = 0,
		parts = 0,
		meshParts = 0,
		scripts = {},
		removed = 0,
	}
	local minV: any, maxV: any = nil, nil
	local condemned = {}
	for _, root in list do
		local all = root:GetDescendants()
		table.insert(all, root)
		for _, d in all do
			report.instances += 1
			if d:IsA("LuaSourceContainer") then
				local ok, src = pcall(function() return d.Source end)
				local source = if ok and type(src) == "string" then src else nil
				table.insert(report.scripts, {
					class = d.ClassName,
					path = fullName(d, nil),
					bytes = if source then #source else -1,
					findings = if source then findings(source) else { "unreadable_source" },
				})
				table.insert(condemned, d)
			elseif d:IsA("BasePart") then
				report.parts += 1
				if d:IsA("MeshPart") then report.meshParts += 1 end
				local okCf, cf = pcall(function() return d.CFrame end)
				local okSz, sz = pcall(function() return d.Size end)
				if okCf and okSz then
					local h = sz / 2
					for _, sx in { -1, 1 } do
						for _, sy in { -1, 1 } do
							for _, sz2 in { -1, 1 } do
								local p = cf * Vector3.new(h.X * sx, h.Y * sy, h.Z * sz2)
								minV = if minV then Vector3.new(math.min(minV.X, p.X), math.min(minV.Y, p.Y), math.min(minV.Z, p.Z)) else p
								maxV = if maxV then Vector3.new(math.max(maxV.X, p.X), math.max(maxV.Y, p.Y), math.max(maxV.Z, p.Z)) else p
							end
						end
					end
				end
			end
		end
	end
	if minV and maxV then
		local s = maxV - minV
		report.size = { math.floor(s.X * 100 + 0.5) / 100, math.floor(s.Y * 100 + 0.5) / 100, math.floor(s.Z * 100 + 0.5) / 100 }
	end
	local keep = job.keepScripts == true
	if not keep then
		for _, d in condemned do
			pcall(function() d:Destroy() end)
			report.removed += 1
		end
	end
	local kept = {}
	for _, r in list do
		if keep or not r:IsA("LuaSourceContainer") then table.insert(kept, r) end
	end
	-- Prove it: re-count what is left, from the instances that are about to be written.
	local left = 0
	for _, r in kept do
		if r:IsA("LuaSourceContainer") then left += 1 end
		for _, d in r:GetDescendants() do
			if d:IsA("LuaSourceContainer") then left += 1 end
		end
	end
	report.scriptsLeft = left
	report.clean = left == 0
	if #kept == 0 then
		report.error = "nothing but scripts: no geometry to keep"
		return report
	end
	if job.out then fs.writeFile(job.out, roblox.serializeModel(kept)) end
	report.written = job.out
	return report
end

local args = process.args
local jobs = serde.decode("json", fs.readFile(args[1]))
local out = {}
for i, job in jobs do
	local ok, res = pcall(scan, job)
	if ok then
		table.insert(out, res)
	else
		table.insert(out, { file = job["in"], error = tostring(res), clean = false })
	end
	if i % 25 == 0 then print(string.format("scanned %d/%d", i, #jobs)) end
end
fs.writeFile(args[2], serde.encode("json", out, true))
print(string.format("done %d", #out))
