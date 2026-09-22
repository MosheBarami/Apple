--!strict
-- Native Studio viewport capture. This module is intentionally narrow: it reads the active
-- Studio 3D viewport into a PNG buffer and returns those bytes. It never changes the camera,
-- starts/stops a test, uploads anything, or writes to the DataModel.

local StudioCapture = {}

local MAX_WIDTH = 320
local MAX_HEIGHT = 240
-- Matches frame-bus.ts's 320 KiB base64 ceiling. 240 KiB of PNG bytes expands to at most 320 KiB
-- of base64, so a frame we accept here will not be shipped only to be dropped by worker admission.
local MAX_PNG_BYTES = 240 * 1024
local MAX_BASE64_CHARS = 320 * 1024
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
	if captureService == nil then error("StudioCaptureService is unavailable") end
	if encodingService == nil or type(encodingService.Base64Encode) ~= "function" then error("EncodingService.Base64Encode is unavailable") end

	local self: any = { permissionAsked = false }

	function self:capture(width: number, height: number): (any?, string?)
		local maxW = math.clamp(math.floor(width), 1, MAX_WIDTH)
		local maxH = math.clamp(math.floor(height), 1, MAX_HEIGHT)
		if type(captureService.CanCaptureScreenshot) ~= "function" or type(captureService.CaptureScreenshot) ~= "function" then
			return nil, "StudioCaptureService screenshot methods are unavailable"
		end

		local canOk, canCapture = pcall(function() return captureService:CanCaptureScreenshot() end)
		if not canOk then return nil, "Studio could not query viewport screenshot availability" end
		if canCapture ~= true and not self.permissionAsked and type(captureService.RequestScreenshotPermissionAsync) == "function" then
			self.permissionAsked = true
			local permissionOk, allowed = pcall(function() return captureService:RequestScreenshotPermissionAsync() end)
			if not permissionOk or allowed ~= true then return nil, "Studio viewport screenshot permission was not granted" end
			canOk, canCapture = pcall(function() return captureService:CanCaptureScreenshot() end)
		end
		if not canOk or canCapture ~= true then return nil, "Studio viewport screenshots are unavailable in this session" end

		local enumRef = opts.enum
		if enumRef == nil then
			local ok, value = pcall(function() return Enum end)
			if ok then enumRef = value end
		end
		local format = enumRef and enumRef.StudioCaptureScreenshotFormat and enumRef.StudioCaptureScreenshotFormat.PNG or nil
		local uiMode = enumRef and enumRef.UICaptureMode and enumRef.UICaptureMode.None or nil
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
