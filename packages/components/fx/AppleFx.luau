--!strict
--[[
	AppleFx: the loud, readable feedback of a cartoony game, drawn on each player's screen from what the server
	already tells everyone (attributes and the AppleShot event), so no system has to know about it.
	  enemies   a health bar over each one; a hit flashes it white, bursts sparks and floats the damage;
	            a defeat squashes it into a puff of smoke and floats the coins it paid ("+5")
	  defenders placing one bounces it in with sparkles; levelling it up sparkles again
	  shots     each throw makes a soft sound
	  the base  losing health shakes the camera a little
	Sounds are AppleSounds roles.
]]
local AppleFx = {}

--[[ Pure: how big a squash-and-stretch pop is at time t (0..1) of the animation: overshoots, then settles at 1. ]]
function AppleFx.popScale(t: number): number
	t = math.clamp(t, 0, 1)
	local c = 1.70158 * 1.5
	local u = t - 1
	return 1 + (c + 1) * u * u * u + c * u * u
end

function AppleFx.start()
	local Players = game:GetService("Players")
	local ReplicatedStorage = game:GetService("ReplicatedStorage")
	local TweenService = game:GetService("TweenService")
	local RunService = game:GetService("RunService")
	local Debris = game:GetService("Debris")
	local player = Players.LocalPlayer
	local comps = ReplicatedStorage:WaitForChild("AppleComponents")
	local Sounds = require(comps:WaitForChild("AppleSounds")) :: any

	local SPARK = "rbxasset://textures/particles/sparkles_main.dds"
	local SMOKE = "rbxasset://textures/particles/smoke_main.dds"

	local function tween(o: Instance, t: number, props: { [string]: any })
		TweenService:Create(o, TweenInfo.new(t, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props):Play()
	end

	-- A burst of particles at a point: an invisible anchor that lives just long enough.
	local function burst(at: Vector3, texture: string, count: number, colour: Color3, size: number, speed: number)
		local anchor = Instance.new("Part")
		anchor.Anchored, anchor.CanCollide, anchor.CanQuery, anchor.CanTouch = true, false, false, false
		anchor.Transparency = 1
		anchor.Size = Vector3.new(0.2, 0.2, 0.2)
		anchor.Position = at
		local e = Instance.new("ParticleEmitter")
		e.Texture = texture
		e.Color = ColorSequence.new(colour)
		e.Size = NumberSequence.new({ NumberSequenceKeypoint.new(0, size), NumberSequenceKeypoint.new(1, 0) })
		e.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0), NumberSequenceKeypoint.new(1, 1) })
		e.Speed = NumberRange.new(speed * 0.5, speed)
		e.SpreadAngle = Vector2.new(180, 180)
		e.Lifetime = NumberRange.new(0.35, 0.7)
		e.Rate = 0
		e.LightEmission = 0.4
		e.Drag = 4
		e.Parent = anchor
		anchor.Parent = workspace
		e:Emit(count)
		Debris:AddItem(anchor, 1.2)
	end

	-- Words that float up from a point and fade (damage, coins).
	local function float(at: Vector3, text: string, colour: Color3, big: boolean?)
		local anchor = Instance.new("Part")
		anchor.Anchored, anchor.CanCollide, anchor.CanQuery, anchor.CanTouch = true, false, false, false
		anchor.Transparency = 1
		anchor.Size = Vector3.new(0.2, 0.2, 0.2)
		anchor.Position = at + Vector3.new(math.random() * 2 - 1, 0, math.random() * 2 - 1)
		local bb = Instance.new("BillboardGui")
		bb.Size = UDim2.fromOffset(if big then 140 else 90, if big then 48 else 34)
		bb.AlwaysOnTop = true
		bb.LightInfluence = 0
		bb.Parent = anchor
		local label = Instance.new("TextLabel")
		label.BackgroundTransparency = 1
		label.Size = UDim2.fromScale(1, 1)
		label.Font = Enum.Font.FredokaOne
		label.TextScaled = true
		label.Text = text
		label.TextColor3 = colour
		label.Parent = bb
		local stroke = Instance.new("UIStroke")
		stroke.Thickness = 2.5
		stroke.Parent = label
		anchor.Parent = workspace
		tween(anchor, 0.8, { Position = anchor.Position + Vector3.new(0, 4, 0) })
		task.delay(0.35, function()
			tween(label, 0.45, { TextTransparency = 1 })
			tween(stroke, 0.45, { Transparency = 1 })
		end)
		Debris:AddItem(anchor, 0.9)
	end

	local function topOf(model: Model): Vector3
		local cf, size = model:GetBoundingBox()
		return cf.Position + Vector3.new(0, size.Y / 2, 0)
	end

	-- A short pop: the model grows from small past full size and settles, on this screen only.
	local function popIn(model: Model)
		local ok = pcall(function() return model:GetScale() end)
		if not ok then return end
		local base = model:GetScale()
		local t0 = os.clock()
		local conn: RBXScriptConnection
		conn = RunService.RenderStepped:Connect(function()
			local t = (os.clock() - t0) / 0.35
			if not model.Parent or t >= 1 then
				conn:Disconnect()
				if model.Parent then pcall(function() model:ScaleTo(base) end) end
				return
			end
			pcall(function() model:ScaleTo(base * math.max(0.05, 0.4 + 0.6 * AppleFx.popScale(t))) end)
		end)
	end

	-- Enemies.
	local function enemy(model: Instance)
		if not model:IsA("Model") then return end
		local m = model :: Model
		local _, size = m:GetBoundingBox()
		local bb = Instance.new("BillboardGui")
		bb.Name = "AppleHealth"
		bb.Size = UDim2.fromOffset(70, 12)
		bb.StudsOffsetWorldSpace = Vector3.new(0, size.Y / 2 + 1.2, 0)
		bb.AlwaysOnTop = true
		bb.LightInfluence = 0
		bb.MaxDistance = 120
		bb.Adornee = m.PrimaryPart or m:FindFirstChildWhichIsA("BasePart", true)
		local back = Instance.new("Frame")
		back.Size = UDim2.fromScale(1, 1)
		back.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
		back.Parent = bb
		Instance.new("UICorner", back).CornerRadius = UDim.new(0, 5)
		local edge = Instance.new("UIStroke", back)
		edge.Thickness = 2
		local fill = Instance.new("Frame")
		fill.Size = UDim2.fromScale(1, 1)
		fill.BackgroundColor3 = Color3.fromRGB(93, 230, 90)
		fill.Parent = back
		Instance.new("UICorner", fill).CornerRadius = UDim.new(0, 5)
		bb.Parent = m
		local last = m:GetAttribute("Health") or 0
		m:GetAttributeChangedSignal("Health"):Connect(function()
			local hp = m:GetAttribute("Health") or 0
			local max = math.max(1, m:GetAttribute("MaxHealth") or 1)
			local share = math.clamp(hp / max, 0, 1)
			tween(fill, 0.15, { Size = UDim2.fromScale(share, 1) })
			fill.BackgroundColor3 = if share > 0.5 then Color3.fromRGB(93, 230, 90) elseif share > 0.25 then Color3.fromRGB(255, 205, 60) else Color3.fromRGB(255, 80, 80)
			if hp < last and m.Parent then
				local top = topOf(m)
				float(top, "-" .. tostring(math.floor(last - hp + 0.5)), Color3.new(1, 1, 1))
				burst(top - Vector3.new(0, size.Y / 3, 0), SPARK, 6, Color3.fromRGB(255, 240, 160), 0.9, 10)
				Sounds.play("hit")
				local flash = m:FindFirstChild("AppleFlash") :: Highlight?
				if not flash then
					local h = Instance.new("Highlight")
					h.Name = "AppleFlash"
					h.FillColor = Color3.new(1, 1, 1)
					h.OutlineTransparency = 1
					h.DepthMode = Enum.HighlightDepthMode.Occluded
					h.Parent = m
					flash = h
				end
				local f = flash :: Highlight
				f.FillTransparency = 0.25
				tween(f, 0.18, { FillTransparency = 1 })
			end
			last = hp
		end)
		m:GetAttributeChangedSignal("Defeated"):Connect(function()
			if not m:GetAttribute("Defeated") then return end
			local cf = m:GetBoundingBox()
			bb.Enabled = false
			burst(cf.Position, SMOKE, 14, Color3.fromRGB(255, 255, 255), 3, 8)
			burst(cf.Position, SPARK, 10, Color3.fromRGB(255, 220, 90), 1.2, 14)
			Sounds.play("defeat")
			local reward = m:GetAttribute("Reward") or 0
			if reward > 0 and m:GetAttribute("LastHitBy") == player.UserId then
				float(topOf(m), "+" .. tostring(reward), Color3.fromRGB(255, 225, 77), true)
			end
			-- Squash into the puff.
			local ok, base = pcall(function() return m:GetScale() end)
			if ok then
				local t0 = os.clock()
				local conn: RBXScriptConnection
				conn = RunService.RenderStepped:Connect(function()
					local t = (os.clock() - t0) / 0.3
					if not m.Parent or t >= 1 then conn:Disconnect() return end
					pcall(function() m:ScaleTo(base * math.max(0.05, 1 - t)) end)
				end)
			end
		end)
	end
	local enemies = workspace:WaitForChild("AppleEnemies", 30)
	if enemies then
		enemies.ChildAdded:Connect(enemy)
		for _, e in enemies:GetChildren() do task.spawn(enemy, e) end
	end

	-- Defenders.
	local function defender(model: Instance)
		if not model:IsA("Model") then return end
		local m = model :: Model
		local mine = m:GetAttribute("Owner") == player.UserId
		task.defer(function()
			if not m.Parent then return end
			local cf, size = m:GetBoundingBox()
			burst(cf.Position, SPARK, 16, Color3.fromRGB(255, 255, 180), 1.4, 12)
			popIn(m)
			if mine then Sounds.play("place") end
			local lastLevel = m:GetAttribute("Level") or 1
			m:GetAttributeChangedSignal("Level"):Connect(function()
				local lv = m:GetAttribute("Level") or 1
				if lv > lastLevel and m.Parent then
					local now = m:GetBoundingBox()
					burst(now.Position, SPARK, 24, Color3.fromRGB(120, 220, 255), 1.6, 14)
					float(now.Position + Vector3.new(0, size.Y / 2, 0), "LEVEL " .. lv, Color3.fromRGB(120, 220, 255), true)
					if mine then Sounds.play("levelup") end
				end
				lastLevel = lv
			end)
		end)
	end
	local placed = workspace:WaitForChild("AppleDefenders", 30)
	if placed then placed.ChildAdded:Connect(defender) end

	-- Shots.
	local shot = ReplicatedStorage:WaitForChild("AppleShot", 30) :: RemoteEvent?
	if shot then shot.OnClientEvent:Connect(function() Sounds.play("shoot") end) end

	-- The base.
	local state = ReplicatedStorage:WaitForChild("AppleState", 30)
	if state then
		local last = state:GetAttribute("BaseHealth") or 0
		state:GetAttributeChangedSignal("BaseHealth"):Connect(function()
			local now = state:GetAttribute("BaseHealth") or 0
			if now < last then
				Sounds.play("base")
				local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
				if humanoid then
					task.spawn(function()
						for i = 1, 6 do
							humanoid.CameraOffset = Vector3.new(math.random() - 0.5, math.random() - 0.5, 0) * (0.8 - i * 0.1)
							task.wait(0.03)
						end
						humanoid.CameraOffset = Vector3.zero
					end)
				end
			end
			last = now
		end)
	end
end

if script and script:IsA("LocalScript") then AppleFx.start() end
return AppleFx
