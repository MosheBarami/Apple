-- Buy asks the server (ReplicatedStorage.ShopBuy, from the shop block) and shows its answer; a card whose price is more
-- than the player has (the PayWith currency) turns its button slate. The server decides every purchase. The cards are
-- sized and placed by the block to fit the window. Written by StudPilot's item-grid block; edit freely.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local gui = script.Parent
local grid = gui:WaitForChild("Window"):WaitForChild("Content"):WaitForChild("Grid")
local payWith = grid:GetAttribute("PayWith")
local SLATE = ColorSequence.new(Color3.fromHex("5A6270"), Color3.fromHex("3E4450"))
local function priceOf(text)
	local digits = string.gsub(string.match(text, "[%d,%.]+") or "", ",", "")
	return tonumber(digits)
end
local function wire(card)
	local fill = card:FindFirstChild("Fill")
	local title = fill and fill:FindFirstChild("Title")
	local buy = fill and fill:FindFirstChild("Buy")
	local button = buy and buy:FindFirstChild("Fill")
	if not (title and button) then return end
	local label = button:FindFirstChild("Label")
	local gloss = button:FindFirstChild("Gloss")
	local colour = gloss and gloss.Color
	local price = label and priceOf(label.Text)
	local function afford()
		if not (gloss and price and type(payWith) == "string" and payWith ~= "") then return end
		local have = player:GetAttribute(payWith)
		gloss.Color = (type(have) == "number" and have < price) and SLATE or colour
	end
	if type(payWith) == "string" and payWith ~= "" then player:GetAttributeChangedSignal(payWith):Connect(afford) end
	afford()
	local busy = false
	button.Activated:Connect(function()
		local remote = ReplicatedStorage:FindFirstChild("ShopBuy")
		if busy or not remote or not label then return end
		busy = true
		local okCall, ok, message = pcall(function() return remote:InvokeServer(title.Text) end)
		local was = label.Text
		label.Text = okCall and type(message) == "string" and message or (ok and "Bought!" or "Can't buy")
		task.wait(1.2)
		label.Text = was
		busy = false
	end)
end
for _, card in grid:GetDescendants() do
	if card:IsA("Frame") and (string.match(card.Name, "^Item%d+$") or card.Name == "Featured") then wire(card) end
end
