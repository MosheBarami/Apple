--!strict
--[[
	AppleSounds: the game's sounds by role, for every client script. Each role is a public sound effect pinned and
	checked by Apple (packages/corpus/data/kit-pins.json: free, in the Toolbox, exists); the game's
	AppleClientConfig.sounds can swap any of them ({ click = 123, ... }). Sounds play on this player's screen only,
	may overlap, and a role cannot fire more than once in `gap` seconds (a wave of hits stays a patter, not a roar).
]]
local AppleSounds = {}

export type Role = { id: string, volume: number, speed: number?, gap: number? }
AppleSounds.roles = {
	click = { id = "rbxassetid://88442833509532", volume = 0.5 },
	open = { id = "rbxassetid://17779566040", volume = 0.5 },
	error = { id = "rbxassetid://88442833509532", volume = 0.5, speed = 0.6 },
	cash = { id = "rbxassetid://4612375051", volume = 0.35, gap = 0.08 },
	place = { id = "rbxassetid://17208380755", volume = 0.6 },
	upgrade = { id = "rbxassetid://85188753846582", volume = 0.6 },
	levelup = { id = "rbxassetid://112485797063762", volume = 0.6 },
	countdown = { id = "rbxassetid://7743999789", volume = 0.5 },
	wave = { id = "rbxassetid://121707436171206", volume = 0.45 },
	cleared = { id = "rbxassetid://1836860398", volume = 0.45 },
	shoot = { id = "rbxassetid://140155471173433", volume = 0.18, gap = 0.12 },
	hit = { id = "rbxassetid://17779566040", volume = 0.25, speed = 1.4, gap = 0.06 },
	defeat = { id = "rbxassetid://123539442840355", volume = 0.4, gap = 0.08 },
	base = { id = "rbxasset://sounds/ouch.ogg", volume = 0.6, gap = 0.3 },
} :: { [string]: Role }

local sounds: { [string]: Sound } = {}
local last: { [string]: number } = {}
local configured = false

local function configure()
	if configured then return end
	configured = true
	local comps = game:GetService("ReplicatedStorage"):FindFirstChild("AppleComponents")
	local module = comps and comps:FindFirstChild("AppleClientConfig")
	local ok, cfg = pcall(function() return if module then require(module) :: any else nil end)
	local given = ok and cfg and cfg.sounds
	if type(given) ~= "table" then return end
	for role, id in given do
		local r = AppleSounds.roles[role]
		local asset = if type(id) == "number" then "rbxassetid://" .. id elseif type(id) == "string" then id else nil
		if asset then
			if r then r.id = asset else AppleSounds.roles[role] = { id = asset, volume = 0.5 } end
		end
	end
end

--[[ Pure: whether a role may sound again at `now`. ]]
function AppleSounds.ready(lastAt: number?, now: number, gap: number?): boolean
	return lastAt == nil or now - lastAt >= (gap or 0.03)
end

function AppleSounds.play(role: string, volume: number?)
	configure()
	local r = AppleSounds.roles[role]
	if not r then return end
	local now = os.clock()
	if not AppleSounds.ready(last[role], now, r.gap) then return end
	last[role] = now
	local s = sounds[role]
	if not s then
		local made = Instance.new("Sound")
		made.Name = "Apple_" .. role
		made.SoundId = r.id
		made.Volume = r.volume
		made.PlaybackSpeed = r.speed or 1
		made.Parent = game:GetService("SoundService")
		sounds[role] = made
		s = made
	end
	local sound = s :: Sound
	if volume then sound.Volume = volume end
	game:GetService("SoundService"):PlayLocalSound(sound)
end

return AppleSounds
