--!strict
-- AppleShop's client half: while an item is picked (AppleClientState.pick), the player's free tiles glow;
-- clicking or tapping one buys and places the item there. Right-click, Escape or picking again cancels.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local CollectionService = game:GetService("CollectionService")

local State = require(ReplicatedStorage:WaitForChild("AppleComponents"):WaitForChild("AppleClientState"))
local buy = ReplicatedStorage:WaitForChild("AppleBuy") :: RemoteFunction
local player = Players.LocalPlayer
local glows: { Instance } = {}

local function myTiles(): { BasePart }
	local out = {}
	local plotName = player:GetAttribute("Plot")
	local plots = workspace:FindFirstChild("AppleMap") and workspace.AppleMap:FindFirstChild("Plots")
	local plot = plots and plotName and plots:FindFirstChild(plotName)
	if not plot then return out end
	for _, t in CollectionService:GetTagged("AppleTile") do
		if t:IsA("BasePart") and t:IsDescendantOf(plot) and t:GetAttribute("Occupied") ~= true then table.insert(out, t) end
	end
	return out
end

local function clearGlow()
	for _, g in glows do g:Destroy() end
	table.clear(glows)
end

local function showGlow()
	clearGlow()
	for _, t in myTiles() do
		local box = Instance.new("SelectionBox")
		box.Adornee = t
		box.LineThickness = 0.08
		box.Color3 = Color3.fromRGB(255, 230, 90)
		box.SurfaceColor3 = Color3.fromRGB(255, 230, 90)
		box.SurfaceTransparency = 0.7
		box.Parent = t
		table.insert(glows, box)
	end
end

State.Picked:Connect(function(id: string?)
	if id then showGlow() else clearGlow() end
end)

local function tileAt(screen: Vector2): BasePart?
	local camera = workspace.CurrentCamera
	local ray = camera:ViewportPointToRay(screen.X, screen.Y)
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Include
	params.FilterDescendantsInstances = myTiles()
	local hit = workspace:Raycast(ray.Origin, ray.Direction * 500, params)
	return if hit and hit.Instance:IsA("BasePart") then hit.Instance else nil
end

local function place(screen: Vector2)
	local id = State.picked
	if not id then return end
	local tile = tileAt(screen)
	if not tile then return end
	local ok, message = buy:InvokeServer(id, tile)
	State.say(message or (if ok then "Placed!" else "Could not place it."), ok)
	if ok then State.pick(nil) else showGlow() end
end

UserInputService.InputBegan:Connect(function(input, processed)
	if processed then return end
	if input.UserInputType == Enum.UserInputType.MouseButton1 then
		place(UserInputService:GetMouseLocation()) -- viewport coordinates, as ViewportPointToRay wants
	elseif input.UserInputType == Enum.UserInputType.MouseButton2 or input.KeyCode == Enum.KeyCode.Escape then
		State.pick(nil)
	end
end)
UserInputService.TouchTap:Connect(function(positions, processed)
	if processed or #positions == 0 then return end
	local inset = game:GetService("GuiService"):GetGuiInset()
	place(positions[1] + Vector2.new(0, inset.Y)) -- tap positions leave out the top bar; the viewport does not
end)
player:GetAttributeChangedSignal("Plot"):Connect(function() if State.picked then showGlow() end end)
