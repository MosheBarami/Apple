--!strict
-- Read-only structural inventory of a saved Roblox place. Deserialization never runs scripts.
-- lune run packages/evals/frontier-studio/inspect-place.luau <place.rbxl|rbxlx> <report.json>
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local input = process.args[1]
local output = process.args[2]
if not input or not output then error("usage: inspect-place.luau <place> <report.json>") end
local game = roblox.deserializePlace(fs.readFile(input))

local report: any = {
	file = input,
	instances = 0,
	parts = 0,
	meshParts = 0,
	scripts = 0,
	remoteEvents = 0,
	remoteFunctions = 0,
	screenGuis = 0,
	spawnLocations = {},
	classes = {},
	services = {},
}

local function visit(node: any, service: string)
	report.instances += 1
	local class = node.ClassName
	report.classes[class] = (report.classes[class] or 0) + 1
	if node:IsA("BasePart") then report.parts += 1 end
	if node:IsA("MeshPart") then report.meshParts += 1 end
	if node:IsA("LuaSourceContainer") then report.scripts += 1 end
	if class == "RemoteEvent" then report.remoteEvents += 1 end
	if class == "RemoteFunction" then report.remoteFunctions += 1 end
	if class == "ScreenGui" then report.screenGuis += 1 end
	if node:IsA("SpawnLocation") then
		local okP, cf = pcall(function() return node.CFrame end)
		local okS, size = pcall(function() return node.Size end)
		local record: any = { name = node.Name }
		if okP and cf then
			local p = cf.Position
			record.position = { p.X, p.Y, p.Z }
		end
		if okS and size then record.size = { size.X, size.Y, size.Z } end
		table.insert(report.spawnLocations, record)
	end
	local bucket = report.services[service]
	if not bucket then
		bucket = { instances = 0, parts = 0, scripts = 0, screenGuis = 0, roots = {} }
		report.services[service] = bucket
	end
	bucket.instances += 1
	if node:IsA("BasePart") then bucket.parts += 1 end
	if node:IsA("LuaSourceContainer") then bucket.scripts += 1 end
	if class == "ScreenGui" then bucket.screenGuis += 1 end
	for _, child in node:GetChildren() do visit(child, service) end
end

for _, service in game:GetChildren() do
	local name = service.Name
	for _, root in service:GetChildren() do
		-- Camera and Terrain are Studio defaults, not evidence of game completeness.
		if not (name == "Workspace" and (root:IsA("Camera") or root:IsA("Terrain"))) then
			visit(root, name)
			table.insert(report.services[name].roots, { name = root.Name, class = root.ClassName })
		end
	end
end

fs.writeFile(output, serde.encode("json", report, true))
print(string.format("instances=%d parts=%d scripts=%d screenGuis=%d", report.instances, report.parts, report.scripts, report.screenGuis))
