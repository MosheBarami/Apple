--!strict
-- Native Studio viewport capture. This module is intentionally narrow: it reads the active
-- Studio 3D viewport into native PNG or bounded RGB pixels (PNG encoded by the worker). It never changes the camera,
-- starts/stops a test, uploads anything, or writes to the DataModel.

local StudioCapture = {}

-- Native PNG capture may be up to 640x480: the agent's model judges builds from these pixels (worker evidence-images.ts),
-- and 320x240 was too small to read UI text or spacing (handoff 2026-10-09 section 9). The raw-RGB fallback stays at
-- 320x240, because uncompressed RGB at 640x480 would exceed the transport limit.
local MAX_WIDTH = 640
local MAX_HEIGHT = 480
local LEGACY_MAX_WIDTH = 320
local LEGACY_MAX_HEIGHT = 240
local MAX_PNG_BYTES = 600 * 1024
local MAX_BASE64_CHARS = 820 * 1024
local READY_POLLS = 80
local READY_POLL_SECONDS = 0.025

local function service(gameRef: any, services: any, name: string): any
	if services and services[name] ~= nil then return services[name] end
	if gameRef == nil then return nil end
	local ok, value = pcall(function() return gameRef:GetService(name) end)
	if ok then return value end
	return nil
end

local function finite(value: any): boolean
	return type(value) == "number" and value == value and value > -math.huge and value < math.huge
end

local function activeViewportSize(gameRef: any): (number?, number?)
	if gameRef == nil then return nil, nil end
	local ok, viewport = pcall(function()
		local workspaceRef = gameRef:GetService("Workspace")
		local camera = workspaceRef and workspaceRef.CurrentCamera
		return camera and camera.ViewportSize or nil
	end)
	if not ok or viewport == nil or not finite(viewport.X) or not finite(viewport.Y) then return nil, nil end
	if viewport.X <= 0 or viewport.Y <= 0 then return nil, nil end
	return math.floor(viewport.X), math.floor(viewport.Y)
end

local function fitOutputSize(sourceW: number, sourceH: number, maxW: number, maxH: number): (number, number)
	-- Preserve the viewport's aspect ratio and never upscale a small source. Distorting a 16:9
	-- Studio viewport into the software renderer's older 16:10 request would make the native path
	-- look "live" while changing what the user actually sees.
	local scale = math.min(maxW / sourceW, maxH / sourceH, 1)
	return math.max(1, math.floor(sourceW * scale + 0.5)), math.max(1, math.floor(sourceH * scale + 0.5))
end

local function dimensions(capture: any, fallbackW: number, fallbackH: number): (number, number)
	local ok, value = pcall(function() return capture.Resolution end)
	if ok and value and finite(value.X) and finite(value.Y) and value.X > 0 and value.Y > 0 then
		return math.floor(value.X), math.floor(value.Y)
	end
	return fallbackW, fallbackH
end

local function errorText(capture: any): string
	local ok, values = pcall(function() return capture:GetErrors() end)
	if not ok or type(values) ~= "table" or #values == 0 then return "Studio did not provide a capture error" end
	local out = {}
	for index = 1, math.min(#values, 4) do table.insert(out, tostring(values[index])) end
	return table.concat(out, "; ")
end

local function bufferReady(capture: any): (boolean, string?)
	for _ = 1, READY_POLLS do
		local ok, status = pcall(function() return capture.BufferStatus end)
		if not ok then return true, nil end -- Older builds may not expose status; GetBuffer remains authoritative.
		local text = tostring(status)
		if string.find(text, "Ready", 1, true) then return true, nil end
		if string.find(text, "Error", 1, true) then return false, errorText(capture) end
		if task and type(task.wait) == "function" then task.wait(READY_POLL_SECONDS) else break end
	end
	return false, "Studio viewport capture did not become ready within two seconds"
end

function StudioCapture.new(options: any?): any
	local opts = options or {}
	local gameRef = opts.game
	if gameRef == nil then
		local ok, value = pcall(function() return game end)
		if ok then gameRef = value end
	end
	local captureService = opts.captureService or service(gameRef, opts.services, "StudioCaptureService")
	local encodingService = opts.encodingService or service(gameRef, opts.services, "EncodingService")
	local legacyCaptureService = opts.legacyCaptureService or service(gameRef, opts.services, "CaptureService")
	local assetService = opts.assetService or service(gameRef, opts.services, "AssetService")
	if captureService == nil and legacyCaptureService == nil then error("native capture services are unavailable") end
	if encodingService == nil or type(encodingService.Base64Encode) ~= "function" then error("EncodingService.Base64Encode is unavailable") end

	local self: any = { permissionAsked = false, permissionFailure = nil }

	local function legacyCapture(maxW: number, maxH: number, stillCurrent: any): (any?, string?)
		local images = {}
		local function cleanup() for _, image in images do pcall(function() image:Destroy() end) end end
		local function fence()
			local ok, live = pcall(function()
				return type(stillCurrent) == "function" and stillCurrent() == true
					and type(opts.isEdit) == "function" and opts.isEdit() == true
			end)
			if not ok or not live then error("native callback capture requires live paired consent in edit mode") end
		end
		local ok, result = pcall(function()
			fence()
			if not legacyCaptureService or type(legacyCaptureService.CaptureScreenshot) ~= "function" or not assetService
				or type(assetService.CreateEditableImageAsync) ~= "function" then error("native callback/image APIs unavailable") end
			local uri = nil
			legacyCaptureService:CaptureScreenshot(function(value) uri = value end)
			for _=1,100 do
				fence()
				if uri ~= nil then break end
				if not task or type(task.wait) ~= "function" then break end
				task.wait(0.1)
			end
			fence()
			if type(uri) ~= "string" or #uri < 1 or #uri > 2048 then error("native screenshot callback timed out or returned no content") end
			local content = opts.content or Content
			local image = assetService:CreateEditableImageAsync(content.fromUri(uri))
			if not image then error("native screenshot EditableImage unavailable") end
			table.insert(images,image); fence()
			local size = image.Size
			if not size or not finite(size.X) or not finite(size.Y) or size.X < 1 or size.Y < 1 or size.X > 4096 or size.Y > 4096 or size.X*size.Y > 8*1024*1024 then error("native screenshot dimensions exceed read cap") end
			local nativeW,nativeH = math.floor(size.X),math.floor(size.Y)
			local w,h = fitOutputSize(nativeW,nativeH,maxW,maxH)
			if w ~= nativeW or h ~= nativeH then
				local enumRef = opts.enum or Enum
				local target = assetService:CreateEditableImage({Size=Vector2.new(w,h)})
				if not target then error("native image resampling unavailable") end
				table.insert(images,target); fence()
				target:DrawImageTransformed(Vector2.new(0,0),Vector2.new(w/nativeW,h/nativeH),0,image,{
					CombineType=enumRef.ImageCombineType.AlphaBlend,SamplingMode=enumRef.ResamplerMode.Default,PivotPoint=Vector2.new(0,0)})
				image = target
			end
			fence()
			local rgba = image:ReadPixelsBuffer(Vector2.new(0,0),Vector2.new(w,h))
			if buffer.len(rgba) ~= w*h*4 then error("native RGBA length mismatch") end
			local rgb = buffer.create(w*h*3)
			for pixel=0,w*h-1 do
				for channel=0,2 do buffer.writeu8(rgb,pixel*3+channel,buffer.readu8(rgba,pixel*4+channel)) end
			end
			fence()
			local encoded = buffer.tostring(encodingService:Base64Encode(rgb))
			fence()
			if #encoded < 1 or #encoded > MAX_BASE64_CHARS then error("native RGB exceeds frame transport cap") end
			return {source="studio_viewport",encoding="rgb24",rgbBase64=encoded,width=w,height=h,
				nativeWidth=nativeW,nativeHeight=nativeH,resampled=w~=nativeW or h~=nativeH,
				captureMethod="capture_service",capturedAt=os.time()*1000,targetFramed=false}
		end)
		cleanup()
		if not ok then return nil,"Native CaptureService failed: "..string.sub(tostring(result),1,240) end
		return result,nil
	end

	function self:capture(width: number, height: number, stillCurrent: any?): (any?, string?)
		local maxW = math.clamp(math.floor(width), 1, MAX_WIDTH)
		local maxH = math.clamp(math.floor(height), 1, MAX_HEIGHT)
		local legacyW, legacyH = math.min(maxW, LEGACY_MAX_WIDTH), math.min(maxH, LEGACY_MAX_HEIGHT)
		if captureService == nil or self.legacyUnsupported then return legacyCapture(legacyW,legacyH,stillCurrent) end
		if type(captureService.CanCaptureScreenshot) ~= "function" or type(captureService.CaptureScreenshot) ~= "function" then
			return nil, "StudioCaptureService screenshot methods are unavailable"
		end

		local canOk, canCapture = pcall(function() return captureService:CanCaptureScreenshot() end)
		if not canOk then return nil, "CanCaptureScreenshot failed: " .. string.sub(tostring(canCapture),1,240) end
		if type(canCapture) ~= "boolean" then return nil, "CanCaptureScreenshot returned unexpected " .. typeof(canCapture) .. ": " .. string.sub(tostring(canCapture),1,120) end
		if not canCapture then
			if self.permissionFailure then return nil,self.permissionFailure end
			if type(captureService.RequestScreenshotPermissionAsync) ~= "function" then return nil,"CanCaptureScreenshot returned false; RequestScreenshotPermissionAsync is unavailable" end
			if not self.permissionAsked then
				self.permissionAsked = true
				local permissionOk, allowed = pcall(function() return captureService:RequestScreenshotPermissionAsync() end)
				if not permissionOk then
					self.permissionFailure = "RequestScreenshotPermissionAsync failed: " .. string.sub(tostring(allowed),1,240)
					-- An unavailable API is distinct from a denied permission. Actual denial never falls through.
					if string.find(tostring(allowed),"Feature not supported yet",1,true) then
						self.legacyUnsupported = true
						return legacyCapture(legacyW,legacyH,stillCurrent)
					end
				elseif type(allowed) ~= "boolean" then
					self.permissionFailure = "RequestScreenshotPermissionAsync returned unexpected " .. typeof(allowed) .. ": " .. string.sub(tostring(allowed),1,120)
				elseif not allowed then
					self.permissionFailure = "RequestScreenshotPermissionAsync returned false; CanCaptureScreenshot was false. Screenshot permission was not granted. Roblox supplied no denial reason; global screenshot setting and remembered plugin permission are unknown. No settings changed."
				end
				if self.permissionFailure then return nil,self.permissionFailure end
				canOk, canCapture = pcall(function() return captureService:CanCaptureScreenshot() end)
				if not canOk then return nil,"CanCaptureScreenshot failed after permission was granted: " .. string.sub(tostring(canCapture),1,240) end
			end
		end
		if canCapture ~= true then return nil,"Screenshot permission was granted, but CanCaptureScreenshot is not true; active viewport capture remains unavailable" end

		local enumRef = opts.enum
		if enumRef == nil then
			local ok, value = pcall(function() return Enum end)
			if ok then enumRef = value end
		end
		local format = enumRef and enumRef.StudioCaptureScreenshotFormat and enumRef.StudioCaptureScreenshotFormat.PNG or nil
		local uiMode = enumRef and enumRef.UICaptureMode and enumRef.UICaptureMode.All or nil
		if format == nil then return nil, "PNG viewport capture is unavailable in this Studio build" end
		local sourceW, sourceH = activeViewportSize(gameRef)
		if sourceW == nil or sourceH == nil then
			return nil, "Studio did not expose a positive active 3D viewport size"
		end
		local w, h = fitOutputSize(sourceW, sourceH, maxW, maxH)
		local resampleMode = enumRef and enumRef.ResamplerMode and enumRef.ResamplerMode.Default or nil
		if (w ~= sourceW or h ~= sourceH) and resampleMode == nil then
			return nil, "Studio cannot resample the active viewport in this build"
		end

		-- CaptureScreenshot does not infer the source region from OutputSize. CaptureSize describes the
		-- full active 3D viewport; OutputSize is the bounded transport image. Roblox requires an
		-- explicit ResampleMode whenever those sizes differ.
		local optionsTable: any = {
			Position = Vector2.new(0, 0),
			CaptureSize = Vector2.new(sourceW, sourceH),
			OutputSize = Vector2.new(w, h),
			Format = format,
		}
		if w ~= sourceW or h ~= sourceH then optionsTable.ResampleMode = resampleMode end
		if uiMode ~= nil then optionsTable.UICaptureMode = uiMode end
		local captured, captureOrErr = pcall(function() return captureService:CaptureScreenshot(optionsTable) end)
		if not captured or captureOrErr == nil then return nil, "Studio viewport capture failed: " .. tostring(captureOrErr) end
		local shot = captureOrErr
		local ready, readyErr = bufferReady(shot)
		if not ready then pcall(function() shot:Destroy() end); return nil, readyErr end
		local got, png = pcall(function() return shot:GetBuffer() end)
		if not got or png == nil then pcall(function() shot:Destroy() end); return nil, "Studio viewport capture returned no PNG buffer" end
		local lengthOk, length = pcall(function() return buffer.len(png) end)
		if not lengthOk or type(length) ~= "number" or length < 8 or length > MAX_PNG_BYTES then
			pcall(function() shot:Destroy() end)
			return nil, "Studio viewport PNG is empty or exceeds the capture byte limit"
		end
		local signatureOk, signature = pcall(function()
			return { buffer.readu8(png, 0), buffer.readu8(png, 1), buffer.readu8(png, 2), buffer.readu8(png, 3), buffer.readu8(png, 4), buffer.readu8(png, 5), buffer.readu8(png, 6), buffer.readu8(png, 7) }
		end)
		if not signatureOk or signature[1] ~= 0x89 or signature[2] ~= 0x50 or signature[3] ~= 0x4e or signature[4] ~= 0x47
			or signature[5] ~= 0x0d or signature[6] ~= 0x0a or signature[7] ~= 0x1a or signature[8] ~= 0x0a then
			pcall(function() shot:Destroy() end)
			return nil, "Studio viewport capture did not return a PNG"
		end
		local encodedOk, encoded = pcall(function() return encodingService:Base64Encode(png) end)
		if not encodedOk or encoded == nil then pcall(function() shot:Destroy() end); return nil, "Studio could not base64-encode the viewport PNG" end
		local textOk, pngBase64 = pcall(function() return buffer.tostring(encoded) end)
		if not textOk or type(pngBase64) ~= "string" or #pngBase64 == 0 then pcall(function() shot:Destroy() end); return nil, "Studio returned an unreadable encoded viewport PNG" end
		if #pngBase64 > MAX_BASE64_CHARS then pcall(function() shot:Destroy() end); return nil, "Studio viewport PNG exceeds the frame transport limit" end
		local actualW, actualH = dimensions(shot, w, h)
		pcall(function() shot:Destroy() end)
		return {
			source = "studio_viewport",
			encoding = "png",
			rgbBase64 = pngBase64,
			width = actualW,
			height = actualH,
			capturedAt = os.time() * 1000,
		}, nil
	end

	return self
end

return StudioCapture
