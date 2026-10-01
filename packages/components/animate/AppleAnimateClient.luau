--!strict
-- AppleAnimate's client half: a real key press plays the clips bound to that key (play = "key"), so a keyboard in the
-- game types along with the player's own keyboard. Keys typed into a text box or a menu are not sent.
local UserInputService = game:GetService("UserInputService")
local remote = game:GetService("ReplicatedStorage"):WaitForChild("AppleAnimateKey") :: RemoteEvent
UserInputService.InputBegan:Connect(function(input, processed)
	if processed or input.UserInputType ~= Enum.UserInputType.Keyboard then return end
	remote:FireServer(input.KeyCode.Name)
end)

-- Every clip that plays is announced on AppleAnimatePlayed (for any screen that wants it, like a counter). With no
-- listener Roblox queues them and drops them by the thousand with an error each time (the owner's play session,
-- 2026-10-01: "invocation queue exhausted ... 1024 events dropped"), so this client always takes them.
local played = game:GetService("ReplicatedStorage"):WaitForChild("AppleAnimatePlayed", 10)

-- A big white "+N" with a black outline rises off every key this player presses or steps on and fades (the owner's
-- reference: a walk-on keyboard with "+1" popping under the player's feet). N is what a press pays them (PerPress, from
-- AppleUpgrades), else 1: one more key. At most ten a second, so a run across the keys is a shower, not a wall.
local TweenService = game:GetService("TweenService")
local me = game:GetService("Players").LocalPlayer
local shown: { number } = {}
local function popUp(model: Instance, clipName: string)
	local now = os.clock()
	for i = #shown, 1, -1 do if now - shown[i] >= 1 then table.remove(shown, i) end end
	if #shown >= 10 then return end
	table.insert(shown, now)
	local partName = string.match(clipName, "^(.-)%.") or clipName
	local part = model:FindFirstChild(partName, true)
	if not (part and part:IsA("BasePart")) then
		part = if model:IsA("Model") then model.PrimaryPart else nil
	end
	if not part then return end
	local amount = tonumber(me:GetAttribute("PerPress")) or 1
	local board = Instance.new("BillboardGui")
	board.Size = UDim2.fromScale(3, 1.6)
	board.StudsOffset = Vector3.new(0, 1.5, 0)
	board.AlwaysOnTop = true
	board.LightInfluence = 0
	board.Adornee = part
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = "+" .. tostring(math.floor(amount))
	label.TextScaled = true
	label.Font = Enum.Font.FredokaOne
	label.TextColor3 = Color3.new(1, 1, 1)
	local stroke = Instance.new("UIStroke")
	stroke.Thickness = 3
	stroke.Parent = label
	label.Parent = board
	board.Parent = part
	local info = TweenInfo.new(0.75, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(board, info, { StudsOffset = Vector3.new(math.random(-10, 10) / 10, 4.5, 0) }):Play()
	TweenService:Create(label, info, { TextTransparency = 1 }):Play()
	TweenService:Create(stroke, info, { Transparency = 1 }):Play()
	task.delay(0.8, function() board:Destroy() end)
end
if played and played:IsA("RemoteEvent") then
	played.OnClientEvent:Connect(function(model: Instance?, clipName: string?, who: Player?)
		if who == me and typeof(model) == "Instance" and type(clipName) == "string" then popUp(model, clipName) end
	end)
end
