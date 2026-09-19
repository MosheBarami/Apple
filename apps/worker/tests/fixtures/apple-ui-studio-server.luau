-- Isolated LOCAL proof place only. No DataStore, Robux, HTTP, assets or persistent inventory.
assert(game:GetService("RunService"):IsStudio(), "This proof fixture is Studio-only")
local Players = game:GetService("Players")
local Storage = game:GetService("ReplicatedStorage")
local remote = Instance.new("RemoteFunction")
remote.Name = "AppleUIProof"
remote.Parent = Storage
local state = {}
local catalog = {
    { id = "speed", name = "Movement upgrade", price = "25 test coins" },
    { id = "unavailable", name = "Unavailable example", price = "—", disabled = true },
}
local function snapshot(player)
    local current = state[player]
    if not current then
        current = { balance = 100, upgrades = 0, lastRequest = -math.huge }
        state[player] = current
    end
    return current
end
remote.OnServerInvoke = function(player, action, itemId)
    local current = snapshot(player)
    -- Do not accept a client price, balance, reward amount or completion flag.
    if action == "state" then
        local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
        return { balance = current.balance, upgrades = current.upgrades, items = catalog,
            walkSpeed = humanoid and humanoid.WalkSpeed }
    end
    if action ~= "buy" or itemId ~= "speed" then return false, "Unknown item" end
    if os.clock() - current.lastRequest < 0.5 then return false, "Please wait a moment" end
    current.lastRequest = os.clock()
    if current.upgrades >= 3 then return false, "All three upgrades are owned" end
    if current.balance < 25 then return false, "Not enough test coins" end
    local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
    if not humanoid then return false, "Wait for your character" end
    -- No yields between validation and mutation. This is session-only test state.
    current.balance -= 25
    current.upgrades += 1
    humanoid.WalkSpeed = 16 + 4 * current.upgrades
    return true, "Movement upgrade confirmed", { balance = current.balance, upgrades = current.upgrades,
        walkSpeed = humanoid.WalkSpeed }
end
Players.PlayerRemoving:Connect(function(player) state[player] = nil end)
local function joined(player)
    player.CharacterAdded:Connect(function(character)
        local humanoid = character:WaitForChild("Humanoid", 10)
        if humanoid then humanoid.WalkSpeed = 16 + 4 * snapshot(player).upgrades end
    end)
end
Players.PlayerAdded:Connect(joined)
for _, player in ipairs(Players:GetPlayers()) do joined(player) end
print("AppleUI proof server ready: LOCAL SESSION ONLY; no persistence or payments")

-- Only the explicit CLI inspection session gets a finite automatic end. A manual Play session is
-- untouched. This records server-owned state, not a visual verdict or an automatic test pass.
local hasArgs, args = pcall(function() return game:GetService("StudioTestService"):GetTestArgs() end)
if hasArgs and type(args) == "table" and args.appleUIVisualProof == true then
    task.delay(150, function()
        local states = {}
        for _, player in ipairs(Players:GetPlayers()) do
            local current = snapshot(player)
            local humanoid = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
            table.insert(states, { balance = current.balance, upgrades = current.upgrades,
                walkSpeed = humanoid and humanoid.WalkSpeed })
        end
        game:GetService("StudioTestService"):EndTest({ schema = 1, kind = "server_readback",
            reason = "inspection_window_elapsed", states = states, visualVerdict = "unreviewed" })
    end)
end
