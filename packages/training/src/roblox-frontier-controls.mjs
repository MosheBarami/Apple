#!/usr/bin/env node
/**
 * THE CONTROLS. HAND-WRITTEN LUAU WHOSE ONLY JOB IS TO PROVE THE CHECKS CAN FAIL.
 *
 * A check that cannot fail measures nothing while looking exactly like a check that passes, and a
 * benchmark where everything passes reads as good news. That is the repository's own failure shape
 * — a thing PRESENT and never REACHED — and a suite of 50 checks is the easiest possible place to
 * commit it. Two of the checks in this file's first draft were unfalsifiable and were found here
 * rather than by a wrong number in a report.
 *
 * For every item:
 *   `pass`  — a correct answer. It must pass EVERY check on that item. If it does not, either the
 *             answer is wrong or a check is wrong, and both are worth knowing before any model is
 *             measured against them.
 *   `fail`  — one answer per check id, which must FAIL that check. A fail control may fail other
 *             checks too (a handler with no validation fails several at once, which is what real
 *             broken code does); what is not allowed is a check with no control that fails it.
 *
 * These are NOT reference answers. Nothing compares a model's output to them. They exist only so
 * `roblox-frontier.test.mjs` can go red when a check stops discriminating.
 */

// ------------------------------------------------------------------------------------------------
// modern API
// ------------------------------------------------------------------------------------------------

const ANIM_PASS = `
local UserInputService = game:GetService("UserInputService")
local Players = game:GetService("Players")
local player = Players.LocalPlayer
local animation = Instance.new("Animation")
animation.AnimationId = "rbxassetid://507771019"
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.KeyCode ~= Enum.KeyCode.E then return end
	local character = player.Character
	if not character then return end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid then return end
	local animator = humanoid:FindFirstChildOfClass("Animator")
	if not animator then return end
	local track = animator:LoadAnimation(animation)
	track:Play()
end)
`;

const ANIM_HUMANOID = ANIM_PASS
  .replace('local animator = humanoid:FindFirstChildOfClass("Animator")\n\tif not animator then return end\n\tlocal track = animator:LoadAnimation(animation)',
    'local track = humanoid:LoadAnimation(animation)');

const COUNTDOWN_PASS = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local timeLeft = Instance.new("IntValue")
timeLeft.Name = "TimeLeft"
timeLeft.Value = 10
timeLeft.Parent = ReplicatedStorage
local roundOver = Instance.new("RemoteEvent")
roundOver.Name = "RoundOver"
roundOver.Parent = ReplicatedStorage
for i = 10, 1, -1 do
	timeLeft.Value = i
	task.wait(1)
end
timeLeft.Value = 0
roundOver:FireAllClients()
`;

const PLATFORM_PASS = `
local TweenService = game:GetService("TweenService")
local platform = workspace:WaitForChild("Platform")
local startPosition = platform.Position
local info = TweenInfo.new(3, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true)
local tween = TweenService:Create(platform, info, { Position = startPosition + Vector3.new(8, 0, 0) })
tween:Play()
`;

/*
 * SECOND CORRECT ANSWERS FOR THE THREE MODERN-API ITEMS (2026-09-24). Each is the shape a recorded
 * production answer took and was marked down for, rewritten by hand, and each failed under the
 * harness as it stood — for a reason that was the harness's:
 *   - ANIM_PASS_2 connects the track's Stopped and Ended events. The shim had no AnimationTrack
 *     events, `track.Stopped` read as nil, and the handler died one line before `track:Play()`.
 *   - COUNTDOWN_PASS_2 counts down against a deadline on os.clock, polling every tenth of a second.
 *     The shim's clock did not move when a script waited, so the poll never reached its deadline.
 *   - PLATFORM_PASS_2 moves the platform from a Heartbeat connection. Nothing ever stepped a frame.
 * See SHOP_PASS_2 below for why a second answer is the audit.
 */
const ANIM_PASS_2 = `
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")

local EMOTE_ID = "rbxassetid://507771019"
local player = Players.LocalPlayer
local playing = nil

local function onInput(input, gameProcessed)
	if gameProcessed or input.KeyCode ~= Enum.KeyCode.E then
		return
	end
	local character = player.Character or player.CharacterAdded:Wait()
	local humanoid = character:WaitForChild("Humanoid")
	local animator = humanoid:FindFirstChildOfClass("Animator")
	if animator == nil then
		animator = Instance.new("Animator")
		animator.Parent = humanoid
	end
	if playing then
		playing:Stop()
	end
	local emote = Instance.new("Animation")
	emote.AnimationId = EMOTE_ID
	local track = animator:LoadAnimation(emote)
	track.Priority = Enum.AnimationPriority.Action
	track.Stopped:Connect(function()
		if playing == track then
			playing = nil
		end
	end)
	track.Ended:Connect(function()
		emote:Destroy()
	end)
	playing = track
	track:Play()
end

UserInputService.InputBegan:Connect(onInput)
`;

const COUNTDOWN_PASS_2 = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ROUND_SECONDS = 10

local roundOver = Instance.new("RemoteEvent")
roundOver.Name = "RoundOver"
roundOver.Parent = ReplicatedStorage

local timeLeft = Instance.new("IntValue")
timeLeft.Name = "TimeLeft"
timeLeft.Parent = ReplicatedStorage

-- Against a deadline, so a slow frame cannot stretch the round.
local function runRound()
	local deadline = os.clock() + ROUND_SECONDS
	while true do
		local remaining = math.max(0, math.ceil(deadline - os.clock()))
		timeLeft.Value = remaining
		if remaining == 0 then
			break
		end
		task.wait(0.1)
	end
	roundOver:FireAllClients()
end

task.spawn(function()
	while true do
		runRound()
		task.wait(5)
	end
end)
`;

const PLATFORM_PASS_2 = `
local RunService = game:GetService("RunService")

local platform = workspace:WaitForChild("Platform")
local origin = platform.CFrame
local offset = Vector3.new(8, 0, 0)
local LEG_SECONDS = 3

local elapsed = 0
RunService.Heartbeat:Connect(function(dt)
	elapsed += dt
	local leg = (elapsed % (LEG_SECONDS * 2)) / LEG_SECONDS
	local alpha = if leg <= 1 then leg else 2 - leg
	alpha = (1 - math.cos(alpha * math.pi)) / 2
	platform.CFrame = origin + offset * alpha
end)
`;

const CHAT_PASS = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextChatService = game:GetService("TextChatService")
local roundWon = ReplicatedStorage:WaitForChild("RoundWon")
roundWon.OnClientEvent:Connect(function(winnerName)
	local channels = TextChatService:WaitForChild("TextChannels")
	local general = channels:WaitForChild("RBXGeneral")
	general:DisplaySystemMessage(tostring(winnerName) .. " won the round!")
end)
`;

const CHAT_LEGACY = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui = game:GetService("StarterGui")
local roundWon = ReplicatedStorage:WaitForChild("RoundWon")
roundWon.OnClientEvent:Connect(function(winnerName)
	StarterGui:SetCore("ChatMakeSystemMessage", { Text = tostring(winnerName) .. " won the round!" })
end)
`;

const UI_HEAD = `
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer
local gui = player:WaitForChild("PlayerGui"):WaitForChild("ShopGui")
local button = gui:WaitForChild("ShopButton")
local shop = gui:WaitForChild("Shop")
`;

const RAYCAST_PASS = `
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.UserInputType ~= Enum.UserInputType.MouseButton1 then return end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { player.Character }
	local origin = camera.CFrame.Position
	local direction = camera.CFrame.LookVector * 200
	local result = workspace:Raycast(origin, direction, params)
	if result then
		print(result.Instance.Name)
	end
end)
`;

const RAYCAST_LEGACY = `
local Players = game:GetService("Players")
local UserInputService = game:GetService("UserInputService")
local player = Players.LocalPlayer
local camera = workspace.CurrentCamera
UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.UserInputType ~= Enum.UserInputType.MouseButton1 then return end
	local ray = Ray.new(camera.CFrame.Position, camera.CFrame.LookVector * 200)
	local part = workspace:FindPartOnRay(ray, player.Character)
	if part then
		print(part.Name)
	end
end)
`;

// ------------------------------------------------------------------------------------------------
// server authority
// ------------------------------------------------------------------------------------------------

const SHOP_PASS = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local PRICES = { sword = 100 }
local remote = Instance.new("RemoteEvent")
remote.Name = "BuyItem"
remote.Parent = ReplicatedStorage
remote.OnServerEvent:Connect(function(player, itemName)
	if typeof(itemName) ~= "string" then return end
	local price = PRICES[itemName]
	if price == nil then return end
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local coins = stats:FindFirstChild("Coins")
	if not coins then return end
	if coins.Value < price then return end
	coins.Value -= price
end)
`;

/**
 * A SECOND CORRECT ANSWER, WRITTEN TO DISAGREE WITH THE FIRST EVERYWHERE IT IS FREE TO.
 *
 * docs/frontier-for-roblox.md section 8.8 named the audit this belongs to: all fifty checks have a
 * control proving they CAN fail, and not one had a control proving it can pass against anything but
 * its own hand-written pass case. A check tuned to one implementation looks exactly like a check
 * the model failed.
 *
 * shop-debit is where that mattered. `refuses-when-unaffordable` had never passed against a real
 * answer in nine samples, and the reason was that SHOP_PASS keys its table `sword` while every
 * model keys it `Sword` -- so the only evidence the check could ever pass came from the one file
 * that shares the harness author's spelling. This answer keys it `Sword`, reads the balance through
 * a different traversal, validates in a different order and spells the arithmetic differently. It
 * must pass all four checks, or a check is describing an implementation rather than a property.
 */
const SHOP_PASS_2 = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local ITEMS = {
	Sword = { Price = 100 },
}

local buyItem = Instance.new("RemoteEvent")
buyItem.Name = "BuyItem"
buyItem.Parent = ReplicatedStorage

local function wallet(player)
	local leaderstats = player:FindFirstChild("leaderstats")
	if leaderstats == nil then
		return nil
	end
	return leaderstats:FindFirstChild("Coins")
end

buyItem.OnServerEvent:Connect(function(player, itemName)
	if type(itemName) ~= "string" then
		return
	end
	local item = ITEMS[itemName]
	if item == nil then
		return
	end
	local coins = wallet(player)
	if coins == nil then
		return
	end
	if item.Price > coins.Value then
		return
	end
	coins.Value = coins.Value - item.Price
end)
`;

const POTION_HEAD = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local PRICE = 25
local MAX_PER_PURCHASE = 100
local remote = Instance.new("RemoteEvent")
remote.Name = "BuyPotion"
remote.Parent = ReplicatedStorage
`;

const potionHandler = (body) => `${POTION_HEAD}
remote.OnServerEvent:Connect(function(player, quantity)
${body}
end)
`;

const POTION_TAIL = `
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local coins = stats:FindFirstChild("Coins")
	local potions = stats:FindFirstChild("Potions")
	if not coins or not potions then return end
	local cost = quantity * PRICE
	if coins.Value < cost then return end
	coins.Value -= cost
	potions.Value += quantity`;

const ADMIN_HEAD = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ADMINS = { [1001] = true }
local remote = Instance.new("RemoteEvent")
remote.Name = "TeleportPlayer"
remote.Parent = ReplicatedStorage
`;

const ADMIN_BODY = `
	if typeof(target) ~= "Instance" or not target:IsA("Player") then return end
	if typeof(position) ~= "Vector3" then return end
	local character = target.Character
	if not character then return end
	local root = character:FindFirstChild("HumanoidRootPart")
	if not root then return end
	root.CFrame = CFrame.new(position)`;

const REWARD_HEAD = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local COOLDOWN = 60
local REWARD = 500
local lastClaim = {}
local remote = Instance.new("RemoteEvent")
remote.Name = "ClaimReward"
remote.Parent = ReplicatedStorage
`;

const PET_HEAD = `
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextService = game:GetService("TextService")
local MAX_NAME = 40
local remote = Instance.new("RemoteEvent")
remote.Name = "RenamePet"
remote.Parent = ReplicatedStorage
local function petNameValue(player)
	local existing = player:FindFirstChild("PetName")
	if existing then return existing end
	local value = Instance.new("StringValue")
	value.Name = "PetName"
	value.Parent = player
	return value
end
`;

/*
 * The second correct pet-rename answer creates the StringValue when the player joins, which is
 * where nearly every recorded production answer creates it. The probe's player joined without
 * PlayerAdded ever firing, so this answer found no value to write, returned before it filtered, and
 * was marked "unfiltered" and "rename does not land" — for a join the harness never announced.
 */
const PET_PASS_2 = `
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextService = game:GetService("TextService")

local MAX_LENGTH = 24

local renamePet = Instance.new("RemoteEvent")
renamePet.Name = "RenamePet"
renamePet.Parent = ReplicatedStorage

local function giveName(player)
	local petName = Instance.new("StringValue")
	petName.Name = "PetName"
	petName.Value = "Pet"
	petName.Parent = player
end

Players.PlayerAdded:Connect(giveName)
for _, player in Players:GetPlayers() do
	giveName(player)
end

local function cleanName(raw)
	if type(raw) ~= "string" then
		return nil
	end
	local trimmed = raw:match("^%s*(.-)%s*$")
	local length = utf8.len(trimmed)
	if length == nil or length < 1 or length > MAX_LENGTH then
		return nil
	end
	return trimmed
end

renamePet.OnServerEvent:Connect(function(player, requested)
	local name = cleanName(requested)
	if name == nil then
		return
	end
	local petName = player:FindFirstChild("PetName")
	if petName == nil then
		return
	end
	local ok, filtered = pcall(function()
		local result = TextService:FilterStringAsync(name, player.UserId)
		return result:GetNonChatStringForBroadcastAsync()
	end)
	if ok and filtered then
		petName.Value = filtered
	end
end)
`;

// ------------------------------------------------------------------------------------------------
// datastore safety
// ------------------------------------------------------------------------------------------------

const SAVE_PASS = `
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData")
local function save(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local coins = stats:FindFirstChild("Coins")
	if not coins then return end
	local key = "Player_" .. player.UserId
	local value = coins.Value
	for attempt = 1, 5 do
		local ok = pcall(function()
			store:UpdateAsync(key, function()
				return value
			end)
		end)
		if ok then return true end
		task.wait(0.05 * attempt)
	end
	warn("could not save " .. player.Name)
	return false
end
Players.PlayerRemoving:Connect(save)
`;

const ATOMIC_PASS = `
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData")
local module = {}
function module.addCoins(userId, amount)
	local key = "Player_" .. tostring(userId)
	local total
	local ok, err = pcall(function()
		total = store:UpdateAsync(key, function(old)
			return (old or 0) + amount
		end)
	end)
	if not ok then
		error(err)
	end
	return total
end
return module
`;

const ANALYTICS_PASS = `
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local store = DataStoreService:GetDataStore("PlayerData")
Players.PlayerRemoving:Connect(function(player)
	local inventory = player:GetAttribute("Inventory") or "{}"
	local key = "Inv_" .. player.UserId
	pcall(function()
		store:UpdateAsync(key, function()
			return inventory
		end)
	end)
	task.spawn(function()
		pcall(function()
			HttpService:PostAsync("https://example.com/log", inventory)
		end)
	end)
end)
`;

const SHUTDOWN_HEAD = `
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData")
local function save(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local coins = stats:FindFirstChild("Coins")
	if not coins then return end
	local value = coins.Value
	pcall(function()
		store:UpdateAsync("Player_" .. player.UserId, function()
			return value
		end)
	end)
end
Players.PlayerRemoving:Connect(save)
`;

const wipeScript = ({ pcallLoad = true, gateSave = true, makeStats = true, save = true }) => `
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData")
local loadedOk = {}
Players.PlayerAdded:Connect(function(player)
	local key = "Player_" .. player.UserId
	local ok, data
	${pcallLoad
    ? `for attempt = 1, 3 do
		ok, data = pcall(function()
			return store:GetAsync(key)
		end)
		if ok then break end
		task.wait(0.05)
	end`
    : `data = store:GetAsync(key)
	ok = true`}
	loadedOk[player.UserId] = ok and true or false
	${makeStats
    ? `local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = (ok and data) or 0
	coins.Parent = stats
	stats.Parent = player`
    : `-- deliberately never builds leaderstats`}
end)
Players.PlayerRemoving:Connect(function(player)
	${save ? '' : 'do return end'}
	${gateSave ? 'if not loadedOk[player.UserId] then return end' : ''}
	local stats = player:FindFirstChild("leaderstats")
	local coins = stats and stats:FindFirstChild("Coins")
	local value = coins and coins.Value or 0
	pcall(function()
		store:UpdateAsync("Player_" .. player.UserId, function()
			return value
		end)
	end)
end)
`;

// ------------------------------------------------------------------------------------------------

export const CONTROLS = {
  'anim-emote': {
    pass: ANIM_PASS,
    pass2: ANIM_PASS_2,
    fail: {
      'loads-through-animator': ANIM_HUMANOID,
      'not-humanoid-loadanimation': ANIM_HUMANOID,
      // Loads the track through the Animator, correctly, and never plays it. The animation that
      // exists and never runs — this repository's own defect, in Luau.
      'track-is-played': ANIM_PASS.replace('\ttrack:Play()\n', ''),
    },
  },

  'round-countdown': {
    pass: COUNTDOWN_PASS,
    pass2: COUNTDOWN_PASS_2,
    fail: {
      'no-legacy-scheduler': COUNTDOWN_PASS.replace('task.wait(1)', 'wait(1)'),
      'uses-task-scheduler': COUNTDOWN_PASS.replace('\ttask.wait(1)\n', ''),
      'countdown-completes': COUNTDOWN_PASS.replace('roundOver:FireAllClients()', '-- the round never ends'),
    },
  },

  'platform-mover': {
    pass: PLATFORM_PASS,
    pass2: PLATFORM_PASS_2,
    fail: {
      'no-legacy-body-movers': `
local platform = workspace:WaitForChild("Platform")
platform.Anchored = false
local mover = Instance.new("BodyPosition")
mover.MaxForce = Vector3.new(1e5, 1e5, 1e5)
mover.Position = platform.Position + Vector3.new(8, 0, 0)
mover.Parent = platform
`,
      'actually-moves-it': `
local platform = workspace:WaitForChild("Platform")
local target = platform.Position + Vector3.new(8, 0, 0)
print("would move", platform.Name, "to", target)
`,
    },
  },

  'chat-system-message': {
    pass: CHAT_PASS,
    fail: {
      'uses-textchatservice': CHAT_LEGACY,
      'not-legacy-setcore': CHAT_LEGACY,
    },
  },

  'ui-slide-in': {
    pass: `${UI_HEAD}
button.Activated:Connect(function()
	local info = TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local tween = TweenService:Create(shop, info, { Position = UDim2.fromScale(0.5, 0.2) })
	tween:Play()
end)
`,
    fail: {
      'no-deprecated-gui-tween': `${UI_HEAD}
button.Activated:Connect(function()
	shop:TweenPosition(UDim2.fromScale(0.5, 0.2), Enum.EasingDirection.Out, Enum.EasingStyle.Quad, 0.4, true)
end)
`,
      // Builds the tween at load and never plays it: the panel that is wired up and never moves.
      'tween-runs-on-click': `${UI_HEAD}
local info = TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local tween = TweenService:Create(shop, info, { Position = UDim2.fromScale(0.5, 0.2) })
button.Activated:Connect(function()
	print("clicked")
end)
`,
      'uses-library-ui': `${UI_HEAD}
local replacement = Instance.new("Frame")
replacement.Name = "ShopReplacement"
replacement.Parent = gui
button.Activated:Connect(function()
	local info = TweenInfo.new(0.4, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(shop, info, { Position = UDim2.fromScale(0.5, 0.2) }):Play()
end)
`,
    },
  },

  'look-raycast': {
    pass: RAYCAST_PASS,
    fail: {
      'uses-workspace-raycast': RAYCAST_LEGACY,
      'not-findpartonray': RAYCAST_LEGACY,
    },
  },

  'shop-debit': {
    pass: SHOP_PASS,
    // See SHOP_PASS_2. `pass2` is optional and any item may grow one; the test picks it up.
    pass2: SHOP_PASS_2,
    fail: {
      'legit-purchase-works': SHOP_PASS.replace('\tif typeof(itemName) ~= "string" then return end',
        '\tdo return end'),
      'refuses-when-unaffordable': SHOP_PASS.replace('\tif coins.Value < price then return end\n', ''),
      // `itemName:lower()` on nil, a table or a number is the single commonest way a Roblox remote
      // handler dies, and an exploiter gets to send all three for free.
      'survives-hostile-arguments': SHOP_PASS
        .replace('\tif typeof(itemName) ~= "string" then return end\n', '')
        .replace('local price = PRICES[itemName]', 'local price = PRICES[itemName:lower()]'),
      // The price comes from the wire. -500 CREDITS five hundred coins.
      'hostile-input-changes-nothing': SHOP_PASS
        .replace('\tif typeof(itemName) ~= "string" then return end\n', '')
        .replace('local price = PRICES[itemName]', 'local price = tonumber(itemName) or PRICES[itemName]'),
    },
  },

  'client-quantity': {
    pass: potionHandler(`	if typeof(quantity) ~= "number" then return end
	if quantity ~= math.floor(quantity) then return end
	if quantity < 1 or quantity > MAX_PER_PURCHASE then return end
${POTION_TAIL}`),
    fail: {
      'legit-purchase-works': potionHandler('\tdo return end'),
      // No sign check: -10 potions at 25 each is a credit of 250.
      'negative-quantity-refused': potionHandler(`	if typeof(quantity) ~= "number" then return end
	if quantity ~= math.floor(quantity) then return end
${POTION_TAIL}`),
      // No affordability check: a billion potions drives the balance deeply negative.
      'unaffordable-quantity-refused': potionHandler(`	if typeof(quantity) ~= "number" then return end
	if quantity ~= math.floor(quantity) then return end
	if quantity < 1 then return end
${POTION_TAIL.replace('\tif coins.Value < cost then return end\n', '')}`),
      // Compares before it type-checks: a table and a number-as-string both throw here.
      'survives-hostile-arguments': potionHandler(`	if quantity <= 0 then return end
${POTION_TAIL}`),
      // No integer check: 0.5 potions is a corrupted IntValue and a corrupted save.
      // Bounds the quantity and never checks that it is a WHOLE number. `< 1` would have rejected
      // 0.5 by itself and the check would never have been reached, which is how this control was
      // unfalsifiable in its first draft.
      'no-fractional-items': potionHandler(`	if typeof(quantity) ~= "number" then return end
	if quantity <= 0 or quantity > MAX_PER_PURCHASE then return end
${POTION_TAIL}`),
    },
  },

  'admin-command': {
    pass: `${ADMIN_HEAD}
remote.OnServerEvent:Connect(function(player, target, position)
	if not ADMINS[player.UserId] then return end
${ADMIN_BODY}
end)
`,
    fail: {
      'non-admin-is-ignored': `${ADMIN_HEAD}
remote.OnServerEvent:Connect(function(player, target, position)
${ADMIN_BODY}
end)
`,
      // Trusts an identity supplied as an ARGUMENT. The first parameter of OnServerEvent is the
      // only one the engine fills in; everything after it is whatever the client typed.
      'spoofed-identity-is-ignored': `${ADMIN_HEAD}
remote.OnServerEvent:Connect(function(player, target, position, actingAs)
	local actor = actingAs or player
	if not ADMINS[actor.UserId] then return end
${ADMIN_BODY}
end)
`,
      'survives-hostile-arguments': `${ADMIN_HEAD}
remote.OnServerEvent:Connect(function(player, target, position)
	local root = target.Character:FindFirstChild("HumanoidRootPart")
	root.CFrame = CFrame.new(position)
end)
`,
    },
  },

  'reward-cooldown': {
    pass: `${REWARD_HEAD}
remote.OnServerEvent:Connect(function(player)
	local now = os.clock()
	local last = lastClaim[player.UserId]
	if last and now - last < COOLDOWN then return end
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local coins = stats:FindFirstChild("Coins")
	if not coins then return end
	lastClaim[player.UserId] = now
	coins.Value += REWARD
end)
`,
    fail: {
      'first-claim-pays': `${REWARD_HEAD}
remote.OnServerEvent:Connect(function(player)
	do return end
end)
`,
      // The cooldown is on the CLIENT, i.e. nowhere. Forty fires, forty rewards.
      'spam-pays-once': `${REWARD_HEAD}
remote.OnServerEvent:Connect(function(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local coins = stats:FindFirstChild("Coins")
	if not coins then return end
	coins.Value += REWARD
end)
`,
      'survives-hostile-arguments': `${REWARD_HEAD}
remote.OnServerEvent:Connect(function(player, clientToken)
	if clientToken:len() == 0 then return end
	local stats = player:FindFirstChild("leaderstats")
	local coins = stats and stats:FindFirstChild("Coins")
	if coins then coins.Value += REWARD end
end)
`,
    },
  },

  'pet-rename': {
    pass: `${PET_HEAD}
remote.OnServerEvent:Connect(function(player, newName)
	if typeof(newName) ~= "string" then return end
	if #newName == 0 or #newName > MAX_NAME then return end
	local ok, result = pcall(function()
		return TextService:FilterStringAsync(newName, player.UserId)
	end)
	if not ok then return end
	petNameValue(player).Value = result:GetNonChatStringForBroadcastAsync()
end)
`,
    pass2: PET_PASS_2,
    fail: {
      // Gives every player a default name on join — the way PET_PASS_2 does — and never renames it.
      // A probe that only asks "is there a PetName with a value" passes this; the check must ask
      // whether the name the player asked for is the one that landed.
      'legit-rename-works': `${PET_HEAD}
local Players = game:GetService("Players")
Players.PlayerAdded:Connect(function(player)
	petNameValue(player).Value = "Pet"
end)
for _, player in Players:GetPlayers() do
	petNameValue(player).Value = "Pet"
end
remote.OnServerEvent:Connect(function(player, newName)
	do return end
end)
`,
      'length-is-bounded': `${PET_HEAD}
remote.OnServerEvent:Connect(function(player, newName)
	if typeof(newName) ~= "string" then return end
	local ok, result = pcall(function()
		return TextService:FilterStringAsync(newName, player.UserId)
	end)
	if not ok then return end
	petNameValue(player).Value = result:GetNonChatStringForBroadcastAsync()
end)
`,
      'survives-hostile-arguments': `${PET_HEAD}
remote.OnServerEvent:Connect(function(player, newName)
	if #newName > MAX_NAME then return end
	petNameValue(player).Value = newName
end)
`,
      // Unfiltered player text shown to other players. Not a style choice — a moderation failure.
      'text-is-filtered': `${PET_HEAD}
remote.OnServerEvent:Connect(function(player, newName)
	if typeof(newName) ~= "string" then return end
	if #newName == 0 or #newName > MAX_NAME then return end
	petNameValue(player).Value = newName
end)
`,
    },
  },

  'save-survives-throttle': {
    pass: SAVE_PASS,
    fail: {
      // No pcall. The throttle throws, the PlayerRemoving handler aborts, the save never completes
      // and the stack trace goes to a log nobody reads.
      'survives-the-throttle': `
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData")
Players.PlayerRemoving:Connect(function(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local coins = stats:FindFirstChild("Coins")
	if not coins then return end
	store:SetAsync("Player_" .. player.UserId, coins.Value)
end)
`,
      // pcall and pray: one attempt, swallowed. A recoverable throttle becomes permanent silent
      // data loss, and the server looks healthy.
      'retries-after-failure': `
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData")
Players.PlayerRemoving:Connect(function(player)
	local stats = player:FindFirstChild("leaderstats")
	if not stats then return end
	local coins = stats:FindFirstChild("Coins")
	if not coins then return end
	pcall(function()
		store:SetAsync("Player_" .. player.UserId, coins.Value)
	end)
end)
`,
      'data-actually-landed': `
local Players = game:GetService("Players")
Players.PlayerRemoving:Connect(function(player)
	print("goodbye " .. player.Name)
end)
`,
    },
  },

  'atomic-add': {
    pass: ATOMIC_PASS,
    fail: {
      'exports-the-function': 'return {}\n',
      'both-calls-succeed': `
local module = {}
function module.addCoins(userId, amount)
	error("not implemented")
end
return module
`,
      // GetAsync then SetAsync. The second caller read the value as it was before the first wrote,
      // and its write erases the first. This is the mechanism behind every "my coins reset".
      'concurrent-adds-both-land': `
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData")
local module = {}
function module.addCoins(userId, amount)
	local key = "Player_" .. tostring(userId)
	local current = 0
	pcall(function()
		current = store:GetAsync(key) or 0
	end)
	local total = current + amount
	pcall(function()
		store:SetAsync(key, total)
	end)
	return total
end
return module
`,
      // Atomic, and then reports a number that is not the one in the store.
      'reported-total-is-real': ATOMIC_PASS.replace('\treturn total\nend', '\treturn amount\nend'),
    },
  },

  'save-with-analytics': {
    pass: ANALYTICS_PASS,
    fail: {
      // The HTTP post is INSIDE the transform. The engine refuses to let a transform yield, so the
      // UpdateAsync raises and the save never happens — and the model's own pcall hides the reason.
      'no-yield-inside-the-transform': `
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local HttpService = game:GetService("HttpService")
local store = DataStoreService:GetDataStore("PlayerData")
Players.PlayerRemoving:Connect(function(player)
	local inventory = player:GetAttribute("Inventory") or "{}"
	pcall(function()
		store:UpdateAsync("Inv_" .. player.UserId, function(old)
			HttpService:PostAsync("https://example.com/log", inventory)
			return inventory
		end)
	end)
end)
`,
      'survives-the-save': `
local Players = game:GetService("Players")
local DataStoreService = game:GetService("DataStoreService")
local store = DataStoreService:GetDataStore("PlayerData")
Players.PlayerRemoving:Connect(function(player)
	local inventory = player:GetAttribute("Inventory")
	store:UpdateAsync("Inv_" .. player.UserId, function()
		return inventory
	end)
	error("analytics exploded")
end)
`,
      'data-actually-landed': `
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
Players.PlayerRemoving:Connect(function(player)
	local inventory = player:GetAttribute("Inventory") or "{}"
	pcall(function()
		HttpService:PostAsync("https://example.com/log", inventory)
	end)
end)
`,
    },
  },

  'shutdown-save': {
    pass: `${SHUTDOWN_HEAD}
game:BindToClose(function()
	for _, player in ipairs(Players:GetPlayers()) do
		save(player)
	end
end)
`,
    fail: {
      // PlayerRemoving does not fire for everyone on a shutdown. Every player still in the server
      // loses the session.
      'registers-bindtoclose': SHUTDOWN_HEAD,
      'shutdown-saves-everyone': `${SHUTDOWN_HEAD}
game:BindToClose(function()
	local players = Players:GetPlayers()
	if players[1] then
		save(players[1])
	end
end)
`,
      'shutdown-path-does-not-throw': `${SHUTDOWN_HEAD}
game:BindToClose(function()
	local players = Players:GetPlayers()
	save(players[99].Character)
end)
`,
    },
  },

  'failed-load-no-wipe': {
    pass: wipeScript({}),
    fail: {
      'loads-and-saves-at-all': wipeScript({ save: false }),
      'creates-leaderstats': wipeScript({ makeStats: false }),
      // The whole item, in one line: it saves whether or not the load worked. A failed GetAsync
      // becomes a default of 0, and the leave handler writes that 0 over a real account.
      'failed-load-does-not-wipe': wipeScript({ gateSave: false }),
      'load-failure-does-not-throw': wipeScript({ pcallLoad: false }),
    },
  },
};
