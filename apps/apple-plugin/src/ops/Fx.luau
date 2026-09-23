--!nocheck
-- Apple Studio op family: SOUND AND EFFECT LIBRARY (D-FXLIB-1).
--
--   preview_sound  (consent)  play one library sound to the person at the keyboard, in Studio only
--
-- The effect presets in packages/asset-library/vfx are built with create_instances and set_props;
-- this family only adds the ParticleEmitter properties those presets need (flipbooks and Squash)
-- and the Sound properties an ambient loop needs. Which content a Sound or an emitter may carry is
-- decided in Commands.luau (CONTENT_PROPERTY), never here: a family cannot open a Content property.
--
-- preview_sound creates one Sound that is never parented into the place, plays it through
-- SoundService:PlayLocalSound (Studio's own preview call, heard only on this machine), and destroys
-- it. Nothing is written to the place and nothing is recorded for undo.

local Fx = {}
Fx.name = "fx"
Fx.MAX_PREVIEW_SECONDS = 30

function Fx.build(api)
	local current = nil

	local function stopCurrent()
		if current ~= nil then
			local previous = current
			current = nil
			pcall(function() previous:Stop() end)
			pcall(function() api.destroyInstance(previous) end)
		end
	end

	local function handlePreview(self, op)
		local text, err = api.safeText(op.soundId, 40, "soundId")
		if not text then return nil, "invalid", err end
		-- The same rule as a Sound's SoundId in Commands.luau: an audio asset id and nothing else. The
		-- scheme is compared as a word: the shipped source carries no asset-URL literal.
		local scheme, digits = string.match(text, "^(%l+)://(%d+)$")
		if scheme ~= "rbxassetid" or digits == nil or #digits > 20 then
			return nil, "invalid", "soundId must be a Roblox audio asset id (the rbxassetid scheme and digits), as find_sound returned it"
		end
		local volume = 0.6
		if op.volume ~= nil then
			if not api.finite(op.volume) or op.volume < 0 or op.volume > 1 then return nil, "invalid", "volume must be between 0 and 1" end
			volume = op.volume
		end
		local service = api.serviceFrom(self.game, self.options.services, "SoundService")
		if service == nil then return nil, "refused", "SoundService is unavailable in this Studio session", "none" end
		stopCurrent()
		local sound, makeErr = api.makeInstance(self.options, "Sound")
		if not sound then return nil, "internal", makeErr or "could not create a Sound" end
		local okSet, setErr = pcall(function()
			sound.SoundId = text
			sound.Volume = volume
		end)
		if not okSet then
			pcall(function() api.destroyInstance(sound) end)
			return nil, "internal", "could not set the preview sound: " .. tostring(setErr)
		end
		local okPlay, playErr = pcall(function() service:PlayLocalSound(sound) end)
		if not okPlay then
			pcall(function() api.destroyInstance(sound) end)
			return nil, "internal", "Studio refused PlayLocalSound: " .. tostring(playErr)
		end
		current = sound
		pcall(function()
			task.delay(Fx.MAX_PREVIEW_SECONDS, function()
				if current == sound then stopCurrent() end
			end)
		end)
		local okLoaded, loaded = pcall(function() return sound.IsLoaded end)
		return { played = true, soundId = text, volume = volume, loaded = okLoaded and loaded == true }
	end

	return {
		handlers = {
			preview_sound = handlePreview,
		},
		consentOnly = { preview_sound = true },
		propertyAllow = {
			FlipbookLayout = true,
			FlipbookMode = true,
			FlipbookFramerate = true,
			FlipbookStartRandom = true,
			Squash = true,
			ShapePartial = true,
			Playing = true,
		},
		readProperties = {
			FlipbookLayout = true,
			FlipbookMode = true,
			FlipbookFramerate = true,
			FlipbookStartRandom = true,
			Squash = true,
			ShapePartial = true,
		},
		enumAllow = { ParticleFlipbookLayout = true, ParticleFlipbookMode = true },
	}
end

return Fx
