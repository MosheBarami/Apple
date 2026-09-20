-- SOCIAL screen — friends / party / clan / ranks / chat / invites / moderation
local Players = game:GetService("Players")
local SocialService = game:GetService("SocialService")
local GuiService = game:GetService("GuiService")
local player = Players.LocalPlayer

local gui = Instance.new("ScreenGui")
gui.Name = "SocialScreen"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

local function base(props, parent)
	local f = Instance.new("Frame")
	f.BackgroundColor3 = props.bg or Color3.fromRGB(24, 26, 34)
	f.BorderSizePixel = 0
	for k, v in pairs(props) do
		if k ~= "bg" then f[k] = v end
	end
	f.Parent = parent
	return f
end

local function corner(r, parent)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, r)
	c.Parent = parent
	return c
end

local function label(props, parent)
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Font = Enum.Font.Gotham
	t.TextColor3 = props.color or Color3.fromRGB(235, 238, 245)
	t.TextSize = props.size or 14
	t.TextXAlignment = props.xalign or Enum.TextXAlignment.Left
	t.Text = props.text or ""
	for k, v in pairs(props) do
		if k ~= "color" and k ~= "size" and k ~= "xalign" and k ~= "text" then t[k] = v end
	end
	t.Parent = parent
	return t
end

local function button(props, parent)
	local b = Instance.new("TextButton")
	b.BackgroundColor3 = props.bg or Color3.fromRGB(60, 130, 246)
	b.BorderSizePixel = 0
	b.Font = Enum.Font.GothamBold
	b.TextColor3 = props.color or Color3.new(1, 1, 1)
	b.TextSize = props.size or 13
	b.Text = props.text or ""
	for k, v in pairs(props) do
		if k ~= "bg" and k ~= "color" and k ~= "size" and k ~= "text" then b[k] = v end
	end
	b.Parent = parent
	corner(6, b)
	return b
end

-- Root panel
local root = base({ Name = "Root", Size = UDim2.fromScale(0.62, 0.78), Position = UDim2.fromScale(0.19, 0.11), bg = Color3.fromRGB(20, 22, 30) }, gui)
corner(10, root)
base({ Name = "Accent", Size = UDim2.new(1, 0, 0, 4), bg = Color3.fromRGB(60, 130, 246) }, root)

label({ Text = "Social Hub — Brickyard Tycoon", Size = UDim2.new(1, -24, 0, 40), Position = UDim2.fromOffset(16, 10), size = 20 }, root)
label({ Text = "Friends, party, clan and chat in one place", Size = UDim2.new(1, -24, 0, 18), Position = UDim2.fromOffset(16, 46), size = 13, color = Color3.fromRGB(150, 158, 175) }, root)

-- Tabs
local tabs = base({ Name = "Tabs", Size = UDim2.new(1, -24, 0, 34), Position = UDim2.fromOffset(12, 72), bg = Color3.fromRGB(26, 29, 40) }, root)
corner(8, tabs)
local tabNames = { "Friends", "Party", "Clan", "Ranks", "Chat" }
local tabButtons = {}
for i, name in ipairs(tabNames) do
	local b = button({ Text = name, Size = UDim2.new(0.2, -6, 1, -8), Position = UDim2.new((i - 1) * 0.2, 3, 0, 4), bg = i == 1 and Color3.fromRGB(60, 130, 246) or Color3.fromRGB(38, 42, 56) }, tabs)
	tabButtons[name] = b
end

local pages = {}

local function makePage(name)
	local p = base({ Name = name, Size = UDim2.new(1, -24, 1, -130), Position = UDim2.fromOffset(12, 114), bg = Color3.fromRGB(24, 26, 36), Visible = false }, root)
	corner(8, p)
	pages[name] = p
	return p
end

-- ============ FRIENDS ============
local friendsPage = makePage("Friends")
label({ Text = "Friends not already in your party or clan", Size = UDim2.new(1, -20, 0, 20), Position = UDim2.fromOffset(12, 10), size = 14, color = Color3.fromRGB(150, 158, 175) }, friendsPage)
label({ Text = "Party and clan members are hidden here — find them on their own tabs.", Size = UDim2.new(1, -20, 0, 16), Position = UDim2.fromOffset(12, 30), size = 12, color = Color3.fromRGB(110, 118, 135) }, friendsPage)

-- friend data: presence decides which action exists, not which is greyed
local friendData = {
	{ name = "MintBuilder99", presence = "In match — Brickyard Tycoon", inMatch = true, canChat = true },
	{ name = "PixelForge_Lia", presence = "In lobby", inMatch = false, canChat = true },
	{ name = "StacksOnStacks", presence = "In another experience", inMatch = false, canChat = false },
	{ name = "ConveyorKing", presence = "Online — studio", inMatch = false, canChat = true },
}

local friendList = base({ Name = "List", Size = UDim2.new(1, -20, 1, -56), Position = UDim2.fromOffset(10, 50), bg = Color3.fromRGB(28, 31, 44) }, friendsPage)
corner(8, friendList)
local fl = Instance.new("UIListLayout")
fl.Padding = UDim.new(0, 6)
fl.Parent = friendList
local fp = Instance.new("UIPadding")
fp.PaddingTop = UDim.new(0, 8); fp.PaddingLeft = UDim.new(0, 8); fp.PaddingRight = UDim.new(0, 8)
fp.Parent = friendList

for _, fd in ipairs(friendData) do
	local row = base({ Size = UDim2.new(1, 0, 0, 52), bg = Color3.fromRGB(36, 40, 56) }, friendList)
	corner(6, row)
	local dot = base({ Size = UDim2.fromOffset(10, 10), Position = UDim2.fromOffset(12, 21), bg = fd.inMatch and Color3.fromRGB(80, 220, 120) or Color3.fromRGB(150, 158, 175) }, row)
	corner(5, dot)
	label({ Text = fd.name, Size = UDim2.new(0.4, -30, 0, 20), Position = UDim2.fromOffset(30, 8), size = 15 }, row)
	label({ Text = fd.presence, Size = UDim2.new(0.4, -30, 0, 16), Position = UDim2.fromOffset(30, 28), size = 12, color = Color3.fromRGB(150, 158, 175) }, row)
	-- Rule 0/2: action exists only when it can succeed. Spectate only in-match; message only when chat is allowed.
	if fd.inMatch then
		button({ Text = "Spectate", Size = UDim2.fromOffset(92, 32), Position = UDim2.new(1, -104, 0, 10), bg = Color3.fromRGB(80, 220, 120), color = Color3.fromRGB(15, 30, 20) }, row)
	elseif fd.canChat then
		button({ Text = "Message", Size = UDim2.fromOffset(92, 32), Position = UDim2.new(1, -104, 0, 10), bg = Color3.fromRGB(60, 130, 246) }, row)
	end
	-- Invite always available via platform prompt (rule 1)
	local inv = button({ Text = "Invite", Size = UDim2.fromOffset(92, 32), Position = UDim2.new(1, -204, 0, 10), bg = Color3.fromRGB(38, 42, 56) }, row)
	inv.MouseButton1Click:Connect(function()
		-- Rule 0: check invite permission, then hand off to the platform prompt
		task.spawn(function()
			local ok, canInvite = pcall(function()
				return SocialService:CanSendGameInviteAsync(fd.name and Players:FindFirstChild(fd.name) or player)
			end)
			if ok and canInvite then
				pcall(function() SocialService:PromptGameInvite(player) end)
			else
				inv.Text = "N/A here"
				task.delay(2, function() inv.Text = "Invite" end)
			end
		end)
	end)
end

-- ============ PARTY ============
local partyPage = makePage("Party")
label({ Text = "Your Party — 2 / 4", Size = UDim2.new(1, -20, 0, 22), Position = UDim2.fromOffset(12, 10), size = 16 }, partyPage)
local partyRows = {
	{ name = "You (LocalPlayer)", role = "Party leader", leader = true },
	{ name = "MintBuilder99", role = "Member — in your tycoon" },
}
for i, m in ipairs(partyRows) do
	local row = base({ Size = UDim2.new(1, -20, 0, 48), Position = UDim2.fromOffset(10, 40 + (i - 1) * 54), bg = Color3.fromRGB(36, 40, 56) }, partyPage)
	corner(6, row)
	label({ Text = m.name, Size = UDim2.new(0.5, 0, 0, 20), Position = UDim2.fromOffset(12, 6), size = 15 }, row)
	label({ Text = m.role, Size = UDim2.new(0.5, 0, 0, 16), Position = UDim2.fromOffset(12, 26), size = 12, color = Color3.fromRGB(150, 158, 175) }, row)
	if not m.leader then
		button({ Text = "Kick", Size = UDim2.fromOffset(70, 30), Position = UDim2.new(1, -82, 0, 9), bg = Color3.fromRGB(200, 70, 70) }, row)
	end
end
button({ Text = "Invite friends (opens Roblox prompt)", Size = UDim2.new(1, -20, 0, 36), Position = UDim2.fromOffset(10, 160), bg = Color3.fromRGB(60, 130, 246) }, partyPage).MouseButton1Click:Connect(function()
	task.spawn(function()
		local ok, can = pcall(function() return SocialService:CanSendGameInviteAsync(player) end)
		if ok and can then pcall(function() SocialService:PromptGameInvite(player) end) end
	end)
end)
button({ Text = "Leave party", Size = UDim2.new(1, -20, 0, 36), Position = UDim2.fromOffset(10, 204), bg = Color3.fromRGB(200, 70, 70) }, partyPage)

-- ============ CLAN ============
local clanPage = makePage("Clan")
label({ Text = "Clan: Conveyor Cartel — Level 12", Size = UDim2.new(1, -20, 0, 22), Position = UDim2.fromOffset(12, 10), size = 16 }, clanPage)
local clanRows = {
	{ name = "ConveyorKing", rank = "Chief", income = "12,400 / min" },
	{ name = "PixelForge_Lia", rank = "Officer", income = "9,850 / min" },
	{ name = "You (LocalPlayer)", rank = "Member", income = "6,200 / min" },
	{ name = "DropperDan", rank = "Member", income = "4,780 / min" },
}
for i, m in ipairs(clanRows) do
	local row = base({ Size = UDim2.new(1, -20, 0, 44), Position = UDim2.fromOffset(10, 40 + (i - 1) * 50), bg = Color3.fromRGB(36, 40, 56) }, clanPage)
	corner(6, row)
	label({ Text = m.name, Size = UDim2.new(0.34, 0, 1, 0), Position = UDim2.fromOffset(12, 0), size = 14 }, row)
	label({ Text = m.rank, Size = UDim2.new(0.22, 0, 1, 0), Position = UDim2.new(0.36, 0, 0, 0), size = 13, color = Color3.fromRGB(120, 200, 255) }, row)
	label({ Text = m.income, Size = UDim2.new(0.3, 0, 1, 0), Position = UDim2.new(0.6, 0, 0, 0), size = 13, color = Color3.fromRGB(150, 158, 175) }, row)
end
button({ Text = "Clan tag: [CARTL] — shown next to your chat name", Size = UDim2.new(1, -20, 0, 32), Position = UDim2.fromOffset(10, 246), bg = Color3.fromRGB(38, 42, 56) }, clanPage)

-- ============ RANKS ============
local ranksPage = makePage("Ranks")
label({ Text = "Global Income Ladder — this week", Size = UDim2.new(1, -20, 0, 22), Position = UDim2.fromOffset(12, 10), size = 16 }, ranksPage)
local rankRows = {
	{ "#1", "ConveyorKing", "1,204,500" },
	{ "#2", "PixelForge_Lia", "986,220" },
	{ "#3", "DropperDan", "871,040" },
	{ "#41", "You (LocalPlayer)", "312,880" },
}
for i, r in ipairs(rankRows) do
	local row = base({ Size = UDim2.new(1, -20, 0, 44), Position = UDim2.fromOffset(10, 40 + (i - 1) * 50), bg = i == 4 and Color3.fromRGB(46, 52, 74) or Color3.fromRGB(36, 40, 56) }, ranksPage)
	corner(6, row)
	label({ Text = r[1], Size = UDim2.new(0.1, 0, 1, 0), Position = UDim2.fromOffset(12, 0), size = 15, color = Color3.fromRGB(255, 210, 90) }, row)
	label({ Text = r[2], Size = UDim2.new(0.5, 0, 1, 0), Position = UDim2.new(0.14, 0, 0, 0), size = 14 }, row)
	label({ Text = r[3] .. " cash earned", Size = UDim2.new(0.32, 0, 1, 0), Position = UDim2.new(0.66, 0, 0, 0), size = 13, color = Color3.fromRGB(150, 158, 175) }, row)
end

-- ============ CHAT ============
local chatPage = makePage("Chat")
local chatTabs = { "All", "Clan", "Party" }
local chatTabButtons = {}
for i, name in ipairs(chatTabs) do
	local b = button({ Text = name, Size = UDim2.fromOffset(70, 28), Position = UDim2.fromOffset(10 + (i - 1) * 78, 10), bg = i == 1 and Color3.fromRGB(60, 130, 246) or Color3.fromRGB(38, 42, 56) }, chatPage)
	chatTabButtons[name] = b
end
local chatLog = base({ Size = UDim2.new(1, -20, 1, -110), Position = UDim2.fromOffset(10, 46), bg = Color3.fromRGB(28, 31, 44) }, chatPage)
corner(8, chatLog)
local chatLines = {
	{ tag = "[CARTL]", tagColor = Color3.fromRGB(120, 200, 255), who = "ConveyorKing", msg = "upgraded my second dropper, income is 12k/min now" },
	{ tag = "[PARTY]", tagColor = Color3.fromRGB(120, 255, 160), who = "MintBuilder99", msg = "meet at the central park, we can merge plots" },
	{ tag = "", tagColor = nil, who = "DropperDan", msg = "anyone selling the golden conveyor skin?" },
	{ tag = "[CARTL]", tagColor = Color3.fromRGB(120, 200, 255), who = "PixelForge_Lia", msg = "clan cashout in 20 minutes, get your income up" },
}
for i, line in ipairs(chatLines) do
	local t = Instance.new("TextLabel")
	t.BackgroundTransparency = 1
	t.Size = UDim2.new(1, -16, 0, 18)
	t.Position = UDim2.fromOffset(8, 6 + (i - 1) * 22)
	t.Font = Enum.Font.Gotham
	t.TextSize = 13
	t.TextXAlignment = Enum.TextXAlignment.Left
	t.RichText = true
	t.TextColor3 = Color3.fromRGB(235, 238, 245)
	local tagPart = line.tag ~= "" and ('<font color="#78C8FF">' .. line.tag .. '</font> ') or ""
	t.Text = tagPart .. "<b>" .. line.who .. ":</b> " .. line.msg
	t.Parent = chatLog
end
local chatInput = Instance.new("TextBox")
chatInput.BackgroundColor3 = Color3.fromRGB(36, 40, 56)
chatInput.BorderSizePixel = 0
chatInput.Size = UDim2.new(1, -110, 0, 34)
chatInput.Position = UDim2.new(0, 10, 1, -50)
chatInput.Font = Enum.Font.Gotham
chatInput.TextSize = 14
chatInput.PlaceholderText = "Say something to All, Clan or Party…"
chatInput.Text = ""
chatInput.TextColor3 = Color3.fromRGB(235, 238, 245)
chatInput.Parent = chatPage
corner(6, chatInput)
button({ Text = "Send", Size = UDim2.fromOffset(84, 34), Position = UDim2.new(1, -94, 1, -50) }, chatPage)

-- ============ MODERATION ============
local modBar = base({ Name = "Moderation", Size = UDim2.new(1, -24, 0, 34), Position = UDim2.new(0, 12, 1, -44), bg = Color3.fromRGB(26, 29, 40) }, root)
corner(8, modBar)
label({ Text = "Hold a name to report:", Size = UDim2.new(0.3, 0, 1, 0), Position = UDim2.fromOffset(10, 0), size = 12, color = Color3.fromRGB(150, 158, 175) }, modBar)
button({ Text = "Report", Size = UDim2.fromOffset(70, 24), Position = UDim2.new(0.34, 0, 0, 5), bg = Color3.fromRGB(200, 70, 70) }, modBar)
button({ Text = "Block", Size = UDim2.fromOffset(70, 24), Position = UDim2.new(0.34, 78, 0, 5), bg = Color3.fromRGB(120, 60, 60) }, modBar)
button({ Text = "Mute chat", Size = UDim2.fromOffset(84, 24), Position = UDim2.new(0.34, 156, 0, 5), bg = Color3.fromRGB(120, 60, 60) }, modBar)

-- Tab switching
local function showPage(name)
	for n, p in pairs(pages) do p.Visible = (n == name) end
	for n, b in pairs(tabButtons) do
		b.BackgroundColor3 = (n == name) and Color3.fromRGB(60, 130, 246) or Color3.fromRGB(38, 42, 56)
	end
end
for n, b in pairs(tabButtons) do
	b.MouseButton1Click:Connect(function() showPage(n) end)
end
showPage("Friends")

-- Rule 0 applied live: strip Message buttons for friends the local player cannot contact
task.spawn(function()
	for _, fd in ipairs(friendData) do
		local target = Players:FindFirstChild(fd.name)
		if target then
			local ok, can = pcall(function()
				return Players:CanUsersDirectChatAsync({ player, target })
			end)
			if not ok or not can then
				local list = friendList:FindFirstChildOfClass("Frame")
				for _, row in ipairs(friendList:GetChildren()) do
					if row:IsA("Frame") then
						local nm = row:FindFirstChildOfClass("TextLabel")
						if nm and nm.Text == fd.name then
							local msg = nil
							for _, c in ipairs(row:GetChildren()) do
								if c:IsA("TextButton") and c.Text == "Message" then msg = c end
							end
							if msg then msg:Destroy() end -- absent, not disabled
						end
					end
				end
			end
		end
	end
end)