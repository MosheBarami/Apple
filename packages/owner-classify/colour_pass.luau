-- Owner library classification pass: per wanted asset root, the colour (by part count AND by volume), the visible size and up to
-- 80 of its largest parts as world-aligned boxes, for the thumbnail proxy renderer (thumbs.py). Reads a place file with Lune; it
-- never runs a script and never touches Studio. Paths follow library_extract.luau / library_pieces.luau ("#n" for repeated siblings,
-- %2F for "/").
--   lune run colour_pass.luau <source file> <entries/<id>.assets.json> <game id> <out.json>
-- Wanted: every model, tool, fx holder and map row with at least one part (scripts allowed: the old pieces pass skipped them,
-- which is why a quarter of the models and nine tenths of the tools had no colour).
local fs = require("@lune/fs")
local process = require("@lune/process")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local SERVICES = { "Workspace", "Lighting", "ReplicatedFirst", "ReplicatedStorage", "ServerScriptService",
	"ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "SoundService", "Teams", "Chat" }
local SKIP = { Terrain = true, Camera = true }
local MAX_BOXES = 80
local MAX_PARTS = 60000 -- a whole map past this is sampled by its largest parts only (still one walk)

local function load(file)
	local bytes = fs.readFile(file)
	if string.sub(bytes, 1, 8) == "<roblox " then
		bytes = string.gsub(bytes, '<string name="ClusterGridV2">.-</string>', '<string name="ClusterGridV2"></string>')
	end
	if string.match(string.lower(file), "%.rbxm[x]?$") then
		local container = roblox.Instance.new("Folder")
		container.Name = "Model"
		for _, root in roblox.deserializeModel(bytes) do root.Parent = container end
		return container, false
	end
	local place = roblox.deserializePlace(bytes)
	return place, place:FindFirstChildOfClass("Workspace") ~= nil
end

local function service(root, name)
	local ok, found = pcall(function() return root:FindFirstChildOfClass(name) end)
	return (ok and found) or root:FindFirstChild(name)
end

local CONTENT = { "Folder", "Model", "BasePart", "LuaSourceContainer", "LayerCollector", "Tool", "Sound", "Configuration" }
local function loose(root)
	local out, counts = {}, {}
	for _, child in root:GetChildren() do
		counts[child.Name] = (counts[child.Name] or 0) + 1
		local content = false
		for _, class in CONTENT do if child:IsA(class) then content = true; break end end
		if child.ClassName == "Workspace" then content = false end
		local readme = child:IsA("LuaSourceContainer") and string.find(string.lower(child.Name), "read", 1, true)
		if content and not readme then
			local shadowed = service(root, child.Name) ~= child or counts[child.Name] > 1
			table.insert(out, { node = child, key = if shadowed then child.Name .. "#" .. counts[child.Name] else child.Name })
		end
	end
	return out
end

local file, assetsFile, gameId, outFile = process.args[1], process.args[2], process.args[3], process.args[4]
local assets = serde.decode("json", fs.readFile(assetsFile)).assets
local root, isPlace = load(file)

local want, prefix = {}, { ["/"] = true }
for _, a in assets do
	local k = a.k
	if (k == "model" or k == "tool" or k == "fx" or k == "map") and (a.parts or 0) >= 1 then
		want[a.path] = true
	end
end
for path in want do
	local acc = ""
	for _, seg in string.split(string.sub(path, 2), "/") do
		acc = acc .. "/" .. seg
		prefix[acc] = true
	end
end

local inf = math.huge
local function hex(c)
	return string.format("%02x%02x%02x", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5))
end
local function r1(x) return math.floor(x * 10 + 0.5) / 10 end

local function analyse(node)
	local nodes = node:GetDescendants()
	table.insert(nodes, 1, node)
	local byCount, byVolume, materials = {}, {}, {}
	local parts, visibleParts = 0, 0
	local v0, v1, v2, v3, v4, v5 = inf, inf, inf, -inf, -inf, -inf
	local a0, a1, a2, a3, a4, a5 = inf, inf, inf, -inf, -inf, -inf
	local boxes = {}
	local sampled = false
	for _, n in nodes do
		if n:IsA("BasePart") and not SKIP[n.ClassName] then
			parts += 1
			if parts > MAX_PARTS then sampled = true; break end
			local okc, col = pcall(function() return n.Color end)
			local okm, mat = pcall(function() return n.Material.Name end)
			local okt, tr = pcall(function() return n.Transparency end)
			local visible = not okt or tr < 0.95
			local bok, x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22 = pcall(function() return n.CFrame:GetComponents() end)
			if bok then
				local s = n.Size
				local hx = (math.abs(r00) * s.X + math.abs(r01) * s.Y + math.abs(r02) * s.Z) / 2
				local hy = (math.abs(r10) * s.X + math.abs(r11) * s.Y + math.abs(r12) * s.Z) / 2
				local hz = (math.abs(r20) * s.X + math.abs(r21) * s.Y + math.abs(r22) * s.Z) / 2
				a0, a1, a2 = math.min(a0, x - hx), math.min(a1, y - hy), math.min(a2, z - hz)
				a3, a4, a5 = math.max(a3, x + hx), math.max(a4, y + hy), math.max(a5, z + hz)
				if visible then
					visibleParts += 1
					v0, v1, v2 = math.min(v0, x - hx), math.min(v1, y - hy), math.min(v2, z - hz)
					v3, v4, v5 = math.max(v3, x + hx), math.max(v4, y + hy), math.max(v5, z + hz)
					local h = if okc then hex(col) else "808080"
					local vol = s.X * s.Y * s.Z
					byCount[h] = (byCount[h] or 0) + 1
					byVolume[h] = (byVolume[h] or 0) + vol
					if okm then materials[mat] = (materials[mat] or 0) + 1 end
					-- keep the MAX_BOXES largest by volume (a small insertion list: parts are mostly small)
					-- shape: 0 ball, 1 block (also meshes and unions, which this pass can only draw as their box), 2 cylinder, 3 wedge
					local shape = 1
					if n.ClassName == "Part" then
						local oks, sv = pcall(function() return n.Shape.Value end)
						if oks then shape = sv end
					elseif n:IsA("WedgePart") then
						shape = 3
					end
					local entry = { vol, x - hx, y - hy, z - hz, x + hx, y + hy, z + hz, h, tr, if n:IsA("MeshPart") or n:IsA("UnionOperation") then 1 else 0, shape }
					if #boxes < MAX_BOXES then
						table.insert(boxes, entry)
					else
						local mi, mv = 1, boxes[1][1]
						for i = 2, #boxes do if boxes[i][1] < mv then mi, mv = i, boxes[i][1] end end
						if vol > mv then boxes[mi] = entry end
					end
				end
			end
		end
	end
	local function top(map, k)
		local order = {}
		for h in map do table.insert(order, h) end
		table.sort(order, function(x, y) if map[x] ~= map[y] then return map[x] > map[y] end return x < y end)
		local out = {}
		for i = 1, math.min(k, #order) do table.insert(out, order[i]) end
		return out
	end
	local total = 0
	for _, v in byVolume do total += v end
	local colorsVol = {}
	for _, h in top(byVolume, 3) do
		table.insert(colorsVol, { h, if total > 0 then math.floor(byVolume[h] / total * 100 + 0.5) / 100 else 0 })
	end
	local lo, hi
	if visibleParts > 0 then lo, hi = { v0, v1, v2 }, { v3, v4, v5 } elseif a0 < inf then lo, hi = { a0, a1, a2 }, { a3, a4, a5 } end
	local r = { parts = parts, visible = visibleParts, colors = top(byCount, 3), colorsVol = colorsVol, sampled = sampled or nil }
	if lo then
		r.size = { r1(hi[1] - lo[1]), r1(hi[2] - lo[2]), r1(hi[3] - lo[3]) }
		table.sort(boxes, function(p, q) return p[1] > q[1] end)
		local out = {}
		for _, b in boxes do
			table.insert(out, { r1(b[2] - lo[1]), r1(b[3] - lo[2]), r1(b[4] - lo[3]), r1(b[5] - lo[1]), r1(b[6] - lo[2]), r1(b[7] - lo[3]), b[8], r1(b[9]), b[10], b[11] })
		end
		r.boxes = out
	end
	local best, bestN = nil, -1
	for m, cnt in materials do if cnt > bestN or (cnt == bestN and m < best) then best, bestN = m, cnt end end
	r.material = best
	return r
end

local out = {}
local function visit(node, path)
	if want[path] then
		local ok, info = pcall(analyse, node)
		if ok then
			info.path = path
			table.insert(out, info)
		end
	end
	local counts = {}
	for _, child in node:GetChildren() do
		if not (isPlace and path == "/Workspace" and SKIP[child.ClassName]) then
			counts[child.Name] = (counts[child.Name] or 0) + 1
			local escaped = string.gsub(child.Name, "/", "%%2F")
			local key = if counts[child.Name] > 1 then escaped .. "#" .. counts[child.Name] else escaped
			local cpath = (if path == "/" then "" else path) .. "/" .. key
			if prefix[cpath] then visit(child, cpath) end
		end
	end
end

if isPlace then
	for _, name in SERVICES do
		local node = service(root, name)
		if node and prefix["/" .. name] then visit(node, "/" .. name) end
	end
	for _, item in loose(root) do
		if prefix["/" .. item.key] then visit(item.node, "/" .. item.key) end
	end
else
	visit(root, "/")
end

fs.writeFile(outFile, serde.encode("json", { game = gameId, items = out }))
print(serde.encode("json", { items = #out }))
