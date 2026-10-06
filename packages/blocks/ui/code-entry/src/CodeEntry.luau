-- Sends the typed code to the server and shows its answer. The codes system provides ReplicatedStorage.RedeemCode
-- (a RemoteFunction returning ok, message); the server decides, never this script. Written by StudPilot; edit freely.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local gui = script.Parent
local codes = gui:WaitForChild("Window"):WaitForChild("Content"):WaitForChild("Codes")
local box = codes:WaitForChild("Box")
local status = codes:WaitForChild("Status")
local button = codes:WaitForChild("Redeem"):WaitForChild("Face")
local busy = false
button.Activated:Connect(function()
	if busy then return end
	local code = box.Text:gsub("^%s+", ""):gsub("%s+$", "")
	if code == "" then
		status.TextColor3 = Color3.fromRGB(255, 179, 179)
		status.Text = "Type a code first"
		return
	end
	local remote = ReplicatedStorage:FindFirstChild("RedeemCode")
	if not remote or not remote:IsA("RemoteFunction") then
		status.TextColor3 = Color3.fromRGB(255, 225, 77)
		status.Text = "Codes are not set up in this game yet"
		return
	end
	busy = true
	local okCall, ok, message = pcall(function() return remote:InvokeServer(code) end)
	busy = false
	local accepted = okCall and ok == true
	status.TextColor3 = accepted and Color3.fromRGB(180, 255, 196) or Color3.fromRGB(255, 179, 179)
	status.Text = (okCall and type(message) == "string" and message) or (accepted and "Redeemed!" or "That code did not work")
end)
