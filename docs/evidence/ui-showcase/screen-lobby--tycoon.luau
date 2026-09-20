local Players = game:GetService("Players")
local player = Players.LocalPlayer

local gui = Instance.new("ScreenGui")
gui.Name = "LobbyScreen"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.Parent = player:WaitForChild("PlayerGui")

local function corner(parent, radius)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, radius)
	c.Parent = parent
	return c
end

local function stroke(parent, thickness, color)
	local s = Instance.new("UIStroke")
	s.Thickness = thickness
	s.Color = color
	s.Parent = parent
	return s
end

local function label(parent, text, size, pos, textSize, color, alignX, weight)
	local t = Instance.new("TextLabel")
	t.Size = size
	t.Position = pos
	t.BackgroundTransparency = 1
	t.Text = text
	t.TextColor3 = color or Color3.fromRGB(235, 235, 240)
	t.TextSize = textSize
	t.Font = weight or Enum.Font.GothamBold
	t.TextXAlignment = alignX or Enum.TextXAlignment.Center
	t.Parent = parent
	return t
end

-- Root: full-screen lobby backdrop
local root = Instance.new("Frame")
root.Size = UDim2.fromScale(1, 1)
root.Position = UDim2.fromScale(0, 0)
root.BackgroundColor3 = Color3.fromRGB(24, 26, 34)
root.BorderSizePixel = 0
root.Parent = gui

-- Title band
local titleBand = Instance.new("Frame")
titleBand.Size = UDim2.fromScale(1, 0.12)
titleBand.Position = UDim2.fromScale(0, 0)
titleBand.BackgroundColor3 = Color3.fromRGB(30, 33, 44)
titleBand.BorderSizePixel = 0
titleBand.Parent = root
label(titleBand, "MINECART EMPIRE — LOBBY", UDim2.fromScale(0.5, 0.6), UDim2.fromScale(0.25, 0.2), 26, Color3.fromRGB(255, 200, 80))
label(titleBand, "Pick a destination and wait for the elevator", UDim2.fromScale(0.5, 0.3), UDim2.fromScale(0.25, 0.62), 15, Color3.fromRGB(160, 165, 180), Enum.TextXAlignment.Center, Enum.Font.Gotham)

-- Destination place card (rule 0: queue is a PLACE with a card: destination, name, author, difficulty)
local card = Instance.new("Frame")
card.Size = UDim2.fromScale(0.34, 0.52)
card.Position = UDim2.fromScale(0.08, 0.2)
card.BackgroundColor3 = Color3.fromRGB(38, 42, 56)
card.BorderSizePixel = 0
card.Parent = root
corner(card, 12)
stroke(card, 2, Color3.fromRGB(255, 200, 80))

local cardArt = Instance.new("Frame")
cardArt.Size = UDim2.fromScale(1, 0.42)
cardArt.Position = UDim2.fromScale(0, 0)
cardArt.BackgroundColor3 = Color3.fromRGB(70, 90, 130)
cardArt.BorderSizePixel = 0
cardArt.Parent = card
corner(cardArt, 12)
label(cardArt, "DESTINATION", UDim2.fromScale(1, 0.3), UDim2.fromScale(0, 0.1), 13, Color3.fromRGB(220, 225, 240), Enum.TextXAlignment.Center, Enum.Font.Gotham)
label(cardArt, "⛏️", UDim2.fromScale(1, 0.5), UDim2.fromScale(0, 0.35), 44, Color3.fromRGB(255, 255, 255))

label(card, "Deepshaft Mine", UDim2.fromScale(0.9, 0.12), UDim2.fromScale(0.05, 0.46), 22, Color3.fromRGB(255, 255, 255), Enum.TextXAlignment.Left)
label(card, "by BlockForge Studios", UDim2.fromScale(0.9, 0.08), UDim2.fromScale(0.05, 0.6), 15, Color3.fromRGB(150, 200, 255), Enum.TextXAlignment.Left, Enum.Font.Gotham)
label(card, "Difficulty: HARD", UDim2.fromScale(0.9, 0.08), UDim2.fromScale(0.05, 0.7), 15, Color3.fromRGB(255, 120, 100), Enum.TextXAlignment.Left, Enum.Font.Gotham)
label(card, "Max party: 4 players", UDim2.fromScale(0.9, 0.08), UDim2.fromScale(0.05, 0.8), 15, Color3.fromRGB(160, 165, 180), Enum.TextXAlignment.Left, Enum.Font.Gotham)

local joinBtn = Instance.new("TextButton")
joinBtn.Size = UDim2.fromScale(0.9, 0.1)
joinBtn.Position = UDim2.fromScale(0.05, 0.88)
joinBtn.BackgroundColor3 = Color3.fromRGB(80, 170, 90)
joinBtn.Text = "STEP ON THE PAD TO QUEUE"
joinBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
joinBtn.TextSize = 15
joinBtn.Font = Enum.Font.GothamBold
joinBtn.BorderSizePixel = 0
joinBtn.Parent = card
corner(joinBtn, 8)

-- Elevator panel: progress bar IS the empty state (rule 1), countdown with last-5s state (rule 2)
local elevator = Instance.new("Frame")
elevator.Size = UDim2.fromScale(0.44, 0.52)
elevator.Position = UDim2.fromScale(0.5, 0.2)
elevator.BackgroundColor3 = Color3.fromRGB(38, 42, 56)
elevator.BorderSizePixel = 0
elevator.Parent = root
corner(elevator, 12)
stroke(elevator, 2, Color3.fromRGB(90, 95, 115))

label(elevator, "ELEVATOR — DEEPSHAFT MINE", UDim2.fromScale(0.9, 0.1), UDim2.fromScale(0.05, 0.05), 18, Color3.fromRGB(255, 200, 80), Enum.TextXAlignment.Left)

-- Progress bar: empty state text that becomes a timer; occupancy parked at right end
local barBack = Instance.new("Frame")
barBack.Size = UDim2.fromScale(0.9, 0.14)
barBack.Position = UDim2.fromScale(0.05, 0.22)
barBack.BackgroundColor3 = Color3.fromRGB(24, 26, 34)
barBack.BorderSizePixel = 0
barBack.Parent = elevator
corner(barBack, 8)

local barFill = Instance.new("Frame")
barFill.Size = UDim2.fromScale(0.15, 1)
barFill.Position = UDim2.fromScale(0, 0)
barFill.BackgroundColor3 = Color3.fromRGB(80, 170, 90)
barFill.BorderSizePixel = 0
barFill.Parent = barBack
corner(barFill, 8)

local barText = label(barBack, "Waiting for Players...", UDim2.fromScale(1, 1), UDim2.fromScale(0, 0), 16, Color3.fromRGB(235, 235, 240))
local occupancy = label(elevator, "1 / 4", UDim2.fromScale(0.2, 0.14), UDim2.fromScale(0.95, 0.22), 18, Color3.fromRGB(255, 200, 80), Enum.TextXAlignment.Right)

-- Queue config echo (rule 3: first player's choice shown to everyone)
local configBox = Instance.new("Frame")
configBox.Size = UDim2.fromScale(0.9, 0.16)
configBox.Position = UDim2.fromScale(0.05, 0.44)
configBox.BackgroundColor3 = Color3.fromRGB(30, 33, 44)
configBox.BorderSizePixel = 0
configBox.Parent = elevator
corner(configBox, 8)
stroke(configBox, 1, Color3.fromRGB(255, 200, 80))
label(configBox, "Queue set by BuilderMax:", UDim2.fromScale(0.9, 0.4), UDim2.fromScale(0.05, 0.08), 14, Color3.fromRGB(160, 165, 180), Enum.TextXAlignment.Left, Enum.Font.Gotham)
label(configBox, "Mode: Ore Rush   •   Party size: 4   •   Private server: OFF", UDim2.fromScale(0.9, 0.4), UDim2.fromScale(0.05, 0.5), 15, Color3.fromRGB(235, 235, 240), Enum.TextXAlignment.Left)

-- Roster
local roster = Instance.new("Frame")
roster.Size = UDim2.fromScale(0.9, 0.26)
roster.Position = UDim2.fromScale(0.05, 0.66)
roster.BackgroundColor3 = Color3.fromRGB(30, 33, 44)
roster.BorderSizePixel = 0
roster.Parent = elevator
corner(roster, 8)
label(roster, "IN THE ELEVATOR", UDim2.fromScale(0.9, 0.25), UDim2.fromScale(0.05, 0.05), 13, Color3.fromRGB(160, 165, 180), Enum.TextXAlignment.Left, Enum.Font.Gotham)
label(roster, "🟢 BuilderMax (ready)", UDim2.fromScale(0.9, 0.2), UDim2.fromScale(0.05, 0.32), 15, Color3.fromRGB(120, 220, 130), Enum.TextXAlignment.Left, Enum.Font.Gotham)
label(roster, "🟡 PixelPatty (not ready)", UDim2.fromScale(0.9, 0.2), UDim2.fromScale(0.05, 0.56), 15, Color3.fromRGB(255, 200, 80), Enum.TextXAlignment.Left, Enum.Font.Gotham)
label(roster, "⚪ Waiting for 2 more players...", UDim2.fromScale(0.9, 0.2), UDim2.fromScale(0.05, 0.8), 15, Color3.fromRGB(120, 125, 140), Enum.TextXAlignment.Left, Enum.Font.Gotham)

-- Countdown readout with its own last-5-seconds state
local countdown = label(elevator, "Departing in 0:27", UDim2.fromScale(0.9, 0.1), UDim2.fromScale(0.05, 0.94), 17, Color3.fromRGB(120, 220, 130), Enum.TextXAlignment.Left)

-- Right rail: party + private server
local rail = Instance.new("Frame")
rail.Size = UDim2.fromScale(0.3, 0.52)
rail.Position = UDim2.fromScale(0.86, 0.2)
rail.BackgroundColor3 = Color3.fromRGB(38, 42, 56)
rail.BorderSizePixel = 0
rail.Parent = root
corner(rail, 12)
stroke(rail, 2, Color3.fromRGB(90, 95, 115))

label(rail, "YOUR PARTY", UDim2.fromScale(0.9, 0.08), UDim2.fromScale(0.05, 0.05), 16, Color3.fromRGB(255, 200, 80), Enum.TextXAlignment.Left)
label(rail, "👑 BuilderMax — Leader", UDim2.fromScale(0.9, 0.08), UDim2.fromScale(0.05, 0.18), 14, Color3.fromRGB(235, 235, 240), Enum.TextXAlignment.Left, Enum.Font.Gotham)
label(rail, "PixelPatty — Invite sent", UDim2.fromScale(0.9, 0.08), UDim2.fromScale(0.05, 0.28), 14, Color3.fromRGB(160, 165, 180), Enum.TextXAlignment.Left, Enum.Font.Gotham)

local inviteBtn = Instance.new("TextButton")
inviteBtn.Size = UDim2.fromScale(0.9, 0.09)
inviteBtn.Position = UDim2.fromScale(0.05, 0.4)
inviteBtn.BackgroundColor3 = Color3.fromRGB(70, 110, 200)
inviteBtn.Text = "INVITE A FRIEND"
inviteBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
inviteBtn.TextSize = 14
inviteBtn.Font = Enum.Font.GothamBold
inviteBtn.BorderSizePixel = 0
inviteBtn.Parent = rail
corner(inviteBtn, 8)

local readyBtn = Instance.new("TextButton")
readyBtn.Size = UDim2.fromScale(0.9, 0.09)
readyBtn.Position = UDim2.fromScale(0.05, 0.52)
readyBtn.BackgroundColor3 = Color3.fromRGB(80, 170, 90)
readyBtn.Text = "READY ✔"
readyBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
readyBtn.TextSize = 14
readyBtn.Font = Enum.Font.GothamBold
readyBtn.BorderSizePixel = 0
readyBtn.Parent = rail
corner(readyBtn, 8)

label(rail, "PRIVATE SERVER", UDim2.fromScale(0.9, 0.08), UDim2.fromScale(0.05, 0.66), 16, Color3.fromRGB(255, 200, 80), Enum.TextXAlignment.Left)
label(rail, "Free private mine — no confirmation needed", UDim2.fromScale(0.9, 0.14), UDim2.fromScale(0.05, 0.76), 13, Color3.fromRGB(160, 165, 180), Enum.TextXAlignment.Left, Enum.Font.Gotham)

local privateBtn = Instance.new("TextButton")
privateBtn.Size = UDim2.fromScale(0.9, 0.09)
privateBtn.Position = UDim2.fromScale(0.05, 0.88)
privateBtn.BackgroundColor3 = Color3.fromRGB(60, 64, 80)
privateBtn.Text = "CREATE PRIVATE SERVER"
privateBtn.TextColor3 = Color3.fromRGB(235, 235, 240)
privateBtn.TextSize = 13
privateBtn.Font = Enum.Font.GothamBold
privateBtn.BorderSizePixel = 0
privateBtn.Parent = rail
corner(privateBtn, 8)

-- Bottom hint: the teleport that ends the screen
local hint = label(root, "The elevator departs automatically when the countdown ends — you will be teleported to Deepshaft Mine.", UDim2.fromScale(0.84, 0.05), UDim2.fromScale(0.08, 0.8), 15, Color3.fromRGB(160, 165, 180), Enum.TextXAlignment.Center, Enum.Font.Gotham)