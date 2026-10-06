-- Buy buttons ask the server (ReplicatedStorage.ShopBuy, from the shop block) and show its answer; cards whose price is
-- more than the player has (the PayWith currency) turn grey. The server decides every purchase. Written by StudPilot's
-- item-grid block; edit freely.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local gui = script.Parent
local grid = gui:WaitForChild("Window"):WaitForChild("Content"):WaitForChild("Grid")
local payWith = grid:GetAttribute("PayWith")
local GREY = ColorSequence.new(Color3.fromRGB(215, 221, 226), Color3.fromRGB(143, 154, 163))
local function priceOf(text)
	local digits = string.gsub(string.match(text, "[%d,%.]+") or "", ",", "")
	return tonumber(digits)
end
local function wire(card)
	local face = card:FindFirstChild("Face")
	local buy = face and face:FindFirstChild("Buy")
	local button = buy and buy:FindFirstChild("Face")
	if not button then return end
	local nameLabel = face:FindFirstChild("Name") -- the child label, not the Name property
	local name = nameLabel and nameLabel:IsA("TextLabel") and nameLabel.Text
	local priceLabel = button:FindFirstChild("Price")
	local price = priceLabel and priceOf(priceLabel.Text)
	local tint = button:FindFirstChild("Tint")
	local colour = tint and tint.Color
	local function afford()
		if not (tint and price and type(payWith) == "string" and payWith ~= "") then return end
		local have = player:GetAttribute(payWith)
		tint.Color = (type(have) == "number" and have < price) and GREY or colour
	end
	if type(payWith) == "string" and payWith ~= "" then player:GetAttributeChangedSignal(payWith):Connect(afford) end
	afford()
	local busy = false
	button.Activated:Connect(function()
		local remote = ReplicatedStorage:FindFirstChild("ShopBuy")
		if busy or not remote or not name then return end
		busy = true
		local okCall, ok, message = pcall(function() return remote:InvokeServer(name) end)
		local was = priceLabel.Text
		priceLabel.Text = okCall and type(message) == "string" and message or (ok and "Bought!" or "Can't buy")
		task.wait(1.2)
		priceLabel.Text = was
		busy = false
	end)
end
for _, holder in grid:GetDescendants() do
	if holder:IsA("Frame") and (string.match(holder.Name, "^Item%d+$") or holder.Name == "Featured") then wire(holder) end
end
