--!nocheck
-- Native owner-supplied RBXM import. Downloaded source is data, never required or executed.
local OwnerCorpus = { name = "owner_corpus" }
local ORIGIN = "https://apple.moshe-barami111.workers.dev"
local MAX_BYTES = 4 * 1024 * 1024
local ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function base64(text)
	if type(text) ~= "string" or #text % 4 ~= 0 or #text > math.ceil(MAX_BYTES / 3) * 4 then return nil, "invalid binary encoding" end
	local values = {}
	for i = 1, #ALPHABET do values[string.sub(ALPHABET, i, i)] = i - 1 end
	local chunks = {}
	for i = 1, #text, 4 do
		local a, b, c, d = string.sub(text,i,i), string.sub(text,i+1,i+1), string.sub(text,i+2,i+2), string.sub(text,i+3,i+3)
		if values[a] == nil or values[b] == nil or (c ~= "=" and values[c] == nil) or (d ~= "=" and values[d] == nil) then return nil, "invalid binary encoding" end
		if (c == "=" or d == "=") and i + 3 ~= #text then return nil, "invalid binary padding" end
		if c == "=" and d ~= "=" then return nil, "invalid binary padding" end
		local n = values[a] * 262144 + values[b] * 4096 + (values[c] or 0) * 64 + (values[d] or 0)
		table.insert(chunks, string.char(math.floor(n/65536)%256))
		if c ~= "=" then table.insert(chunks, string.char(math.floor(n/256)%256)) end
		if d ~= "=" then table.insert(chunks, string.char(n%256)) end
	end
	return table.concat(chunks)
end

function OwnerCorpus.build(api)
	local function import(self, op, stillCurrent)
		local function current()
			if type(stillCurrent) ~= "function" then return false end
			local ok, yes = pcall(stillCurrent)
			return ok and yes == true
		end
		if not current() then return nil, "refused", "owner import needs a live paired edit-consent fence" end
		for _, value in { op.componentSha256, op.contentToken } do
			if type(value) ~= "string" or #value ~= 64 or string.match(value, "^[a-f0-9]+$") == nil then return nil, "invalid", "invalid component hash or content grant" end
		end
		if type(op.componentId) ~= "string" or string.sub(op.componentId,1,6) ~= "owner:" then return nil, "invalid", "owner component id required" end
		if not api.integer(op.byteLength) or op.byteLength < 1 or op.byteLength > MAX_BYTES then return nil, "invalid", "owner component byte limit exceeded" end
		local name, nameErr = api.safeName(op.name, "owner component name")
		if not name then return nil, "invalid", nameErr end
		local parent, canonical, parentErr, parentKind, remedy = api.resolvePath(self.game, self.options.services, op.parent, true)
		if not parent then return nil, parentKind or "not_found", parentErr, remedy end
		local refused, refusedRemedy = api.destinationRefusal(self.game,parent,canonical,"Folder")
		if refused then return nil, "refused", refused, refusedRemedy end
		if parent:FindFirstChild(name) then return nil, "conflict", "owner import destination name already exists" end
		local http = api.serviceFrom(self.game,self.options.services,"HttpService")
		local serializer = api.serviceFrom(self.game,self.options.services,"SerializationService")
		if not http or not serializer or type(serializer.DeserializeInstancesAsync) ~= "function" then return nil, "unsupported", "native SerializationService import is unavailable in this Studio" end
		local fetched, envelope = pcall(function()
			local response = http:RequestAsync({ Url = ORIGIN .. "/api/owner-corpus/content/" .. op.contentToken, Method = "GET" })
			if response.Success ~= true or type(response.Body) ~= "string" or #response.Body > math.ceil(MAX_BYTES/3)*4 + 1024 then error("content grant fetch failed or exceeded byte limit") end
			return http:JSONDecode(response.Body)
		end)
		if not fetched or type(envelope) ~= "table" or envelope.componentSha256 ~= op.componentSha256 or envelope.byteLength ~= op.byteLength then return nil, "refused", "owner component byte identity could not be verified" end
		local bytes, decodeErr = base64(envelope.rbxmBase64)
		if not bytes or #bytes ~= op.byteLength or string.sub(bytes,1,8) ~= "<roblox!" then return nil, "invalid", decodeErr or "binary component size/header mismatch" end
		if not current() then return nil, "refused", "edit consent ended while fetching owner component" end
		local loaded, roots = pcall(function() return serializer:DeserializeInstancesAsync(buffer.fromstring(bytes)) end)
		if not loaded or type(roots) ~= "table" or #roots < 1 then return nil, "refused", "Studio rejected the native component bytes" end
		local wrapper = nil
		local function cleanup()
			if wrapper then api.destroyInstance(wrapper) end
			for _, root in roots do api.destroyInstance(root) end
		end
		-- Native objects remain detached throughout preflight and source neutralization.
		local sourceCount, nodeCount = 0, 0
		local sanitized, errorText = pcall(function()
			for _, root in roots do
				if root.Parent ~= nil or root.ClassName == "DataModel" then error("export contains attached objects or a whole place; export a component") end
				local nodes = { root }
				for _, node in root:GetDescendants() do table.insert(nodes,node) end
				nodeCount += #nodes
				if nodeCount > 100000 then error("component exceeds the instance budget") end
				for _, node in nodes do
					if node:IsA("LuaSourceContainer") then
						local source = node.Source
						local record, makeErr = api.makeInstance(self.options,"StringValue")
						if not record then error(makeErr) end
						record.Name = node.Name
						record.Value = source
						for attribute, value in node:GetAttributes() do record:SetAttribute(attribute,value) end
						record:SetAttribute("OwnerSourceClass",node.ClassName)
						record:SetAttribute("OwnerComponentSha256",op.componentSha256)
						if node:IsA("BaseScript") then record:SetAttribute("OwnerOriginalDisabled",node.Disabled) end
						-- Preserve descendants, but replace the executable instance itself with source DATA.
						for _, child in node:GetChildren() do child.Parent = record end
						if node.Parent then record.Parent = node.Parent else
							for index, candidate in roots do if candidate == node then roots[index] = record end end
						end
						node:Destroy()
						sourceCount += 1
					end
				end
			end
			wrapper = assert(api.makeInstance(self.options,"Folder"))
			wrapper.Name = name
			wrapper:SetAttribute("OwnerComponentSha256",op.componentSha256)
			wrapper:SetAttribute("OwnerComponentId",op.componentId)
			for _, root in roots do root.Parent = wrapper end
		end)
		if not sanitized then cleanup(); return nil, "refused", "native component could not be staged as data: " .. tostring(errorText) end
		if not current() then cleanup(); return nil, "refused", "edit consent ended during native deserialization" end
		local placed, placeErr = api.parentInstance(wrapper,parent)
		if not placed then cleanup(); return nil, "refused", "native insertion failed: " .. tostring(placeErr) end
		local path, pathErr = api.fullPath(self.game,wrapper)
		if not path then cleanup(); return nil, "internal", pathErr end
		return { inserted = { path }, componentSha256 = op.componentSha256, instances = nodeCount,
			scriptsPreservedAsData = sourceCount, scriptsExecuted = 0,
			note = "Script classes became inert StringValue source records; script references require reviewed integration. Visual and gameplay quality remain unverified." }
	end
	return { handlers = { import_owner_component = import }, mutating = { import_owner_component = true } }
end
return OwnerCorpus
