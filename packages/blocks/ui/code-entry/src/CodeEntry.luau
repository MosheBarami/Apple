-- Sends the typed code to the server (ReplicatedStorage.RedeemCode, from the codes block) and shows its answer; the server
-- decides. Written by StudPilot's code-entry block; edit freely.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local gui = script.Parent
local codes = gui:WaitForChild("Window"):WaitForChild("Content"):WaitForChild("Codes")
local box = codes:WaitForChild("Box")
local status = codes:WaitForChild("Status")
local button = codes:WaitForChild("Redeem"):WaitForChild("Fill")
local GOOD, BAD = Color3.fromHex("6CFF3A"), Color3.fromHex("FF4FA3")
local busy = false
button.Activated:Connect(function()
	if busy then return end
	local code = box.Text:gsub("^%s+", ""):gsub("%s+$", "")
	if code == "" then status.TextColor3 = BAD; status.Text = "Type a code first" return end
	local remote = ReplicatedStorage:FindFirstChild("RedeemCode")
	if not remote or not remote:IsA("RemoteFunction") then status.TextColor3 = BAD; status.Text = "Codes are not set up yet" return end
	busy = true
	local okCall, ok, message = pcall(function() return remote:InvokeServer(code) end)
	busy = false
	local accepted = okCall and ok == true
	status.TextColor3 = accepted and GOOD or BAD
	status.Text = (okCall and type(message) == "string" and message) or (accepted and "Redeemed!" or "That code did not work")
end)
