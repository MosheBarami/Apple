--!nocheck
-- StudPilot Studio op family: IMAGE (2026-10-09).
--
--   create_image_asset { url, width, height, name }  (consent)
--     Fetches generated pixels (base64 RGBA, width*height*4 bytes) from StudPilot's own pixel route, draws them into an
--     EditableImage and uploads that as an Image asset into the Studio user's OWN account (AssetService:CreateAssetAsync,
--     available to locally installed plugins). Returns the new asset id. Nothing in the place changes.
--
-- The art comes from apps/worker/src/image-gen.ts (Lucid Origin). The URL must be StudPilot's pixel route: this op never
-- fetches anything else.

local Image = {}
Image.name = "image"
Image.URL_PREFIX = "https://studpilot.app/api/studio/pixels/"
Image.MAX_SIDE = 1024

local ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local B64 = {}
for i = 1, #ALPHABET do B64[string.byte(ALPHABET, i)] = i - 1 end

function Image.decodeBase64(s: string): buffer?
	s = string.gsub(s, "%s", "")
	local n = #s
	if n % 4 ~= 0 then return nil end
	local pad = if string.sub(s, -2) == "==" then 2 elseif string.sub(s, -1) == "=" then 1 else 0
	local outLen = (n // 4) * 3 - pad
	local out = buffer.create(outLen)
	local o = 0
	for i = 1, n, 4 do
		local a, b, c, d = string.byte(s, i, i + 3)
		local va, vb = B64[a], B64[b]
		if va == nil or vb == nil then return nil end
		local v = va * 262144 + vb * 4096 + (B64[c] or 0) * 64 + (B64[d] or 0)
		if o < outLen then buffer.writeu8(out, o, bit32.rshift(v, 16)); o += 1 end
		if o < outLen then buffer.writeu8(out, o, bit32.band(bit32.rshift(v, 8), 255)); o += 1 end
		if o < outLen then buffer.writeu8(out, o, bit32.band(v, 255)); o += 1 end
	end
	return out
end

function Image.build(api)
	local function handleCreateImageAsset(_self: any, op: any): (any?, string?, string?)
		local url = op.url
		if type(url) ~= "string" or string.sub(url, 1, #Image.URL_PREFIX) ~= Image.URL_PREFIX or string.find(url, "[^%w%-_/:%.]") then
			return nil, "invalid", "url must be StudPilot's pixel route"
		end
		local w, h = tonumber(op.width), tonumber(op.height)
		if not w or not h or w < 1 or h < 1 or w > Image.MAX_SIDE or h > Image.MAX_SIDE or w ~= math.floor(w) or h ~= math.floor(h) then
			return nil, "invalid", ("width and height must be whole numbers 1-%d"):format(Image.MAX_SIDE)
		end
		local name = if type(op.name) == "string" and #op.name > 0 then string.sub(op.name, 1, 50) else "StudPilot image"

		local HttpService = game:GetService("HttpService")
		local okFetch, res = pcall(function()
			return HttpService:RequestAsync({ Url = url, Method = "GET" })
		end)
		if not okFetch then return nil, "transport", "could not download the image: " .. tostring(res) end
		if not res.Success then return nil, "transport", ("could not download the image (HTTP %s)"):format(tostring(res.StatusCode)) end
		local pixels = Image.decodeBase64(res.Body)
		if not pixels or buffer.len(pixels) ~= w * h * 4 then return nil, "invalid", "the downloaded image does not match its size" end

		local AssetService = game:GetService("AssetService")
		local okImage, editable = pcall(function()
			return AssetService:CreateEditableImage({ Size = Vector2.new(w, h) })
		end)
		if not okImage or not editable then return nil, "unsupported", "Studio could not make an EditableImage: " .. tostring(editable) end
		local okWrite, writeErr = pcall(function()
			editable:WritePixelsBuffer(Vector2.zero, Vector2.new(w, h), pixels)
		end)
		if not okWrite then editable:Destroy(); return nil, "internal", "could not draw the image: " .. tostring(writeErr) end

		local okUpload, result, assetId = pcall(function()
			return AssetService:CreateAssetAsync(editable, Enum.AssetType.Image, { Name = name, Description = "Made with StudPilot" })
		end)
		editable:Destroy()
		if not okUpload then
			return nil, "refused", "Roblox did not accept the upload: " .. tostring(result)
				.. " (uploading works from a locally installed StudPilot plugin while signed in to Studio)"
		end
		if result ~= Enum.CreateAssetResult.Success or not assetId then
			return nil, "refused", "Roblox did not create the image: " .. tostring(result)
		end
		return { assetId = assetId, width = w, height = h }
	end

	return {
		handlers = { create_image_asset = handleCreateImageAsset },
		consentOnly = { create_image_asset = true },
	}
end

return Image
