-- Local engine proof fixture, not production game wiring or an observed successful Studio run.
assert(game:GetService("RunService"):IsStudio(), "This proof fixture is Studio-only")
local Players = game:GetService("Players")
local Storage = game:GetService("ReplicatedStorage")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")
local remote = Storage:WaitForChild("AppleUIProof", 10)
assert(remote, "Proof server did not start")
local AppleUI = require(Storage:WaitForChild("AppleUI"))
local themeValue = Storage:FindFirstChild("AppleUIProofTheme")
local theme = themeValue and themeValue.Value or "studio"
local ui
local function showState(state)
    ui:setBalance(tostring(state.balance) .. " test coins")
    ui:setObjectives({{
        id = "upgrades", title = "Try three movement upgrades",
        current = state.upgrades, target = 3, completed = state.upgrades == 3,
    }, { id = "unknown", title = "Unknown progress stays unknown" }})
end
ui = AppleUI.mount(playerGui, {
    name = "AppleUIEngineProof", theme = theme,
    title = theme == "studio" and "Local test shop" or nil,
    onRequest = function(itemId)
        local accepted, message, state = remote:InvokeServer("buy", itemId)
        local measured = state or remote:InvokeServer("state")
        print("APPLE_UI_PURCHASE " .. game:GetService("HttpService"):JSONEncode({
            accepted = accepted == true, item = itemId, message = message,
            balance = measured.balance, upgrades = measured.upgrades,
            walkSpeed = measured.walkSpeed, theme = theme,
        }))
        if accepted == true then
            showState(state)
            ui:notify(message, "success")
        else
            ui:notify(message, "error")
        end
        return accepted, message
    end,
})
local state = remote:InvokeServer("state")
ui:setItems(state.items)
showState(state)
ui:notify("Isolated UI test. Coins reset when the session ends. Nothing is published.", "info", 12)

-- These assertions execute only in Studio Play. Source compilation is NOT a pass for them.
game:GetService("RunService").RenderStepped:Wait()
game:GetService("RunService").RenderStepped:Wait()
local hud = ui.gui:FindFirstChild("HUD")
local objectives = ui.gui:FindFirstChild("Objectives")
assert(hud and hud.AbsoluteSize.X > 0, "HUD failed to render")
assert(objectives and objectives.Visible and objectives.AbsoluteSize.Y > 0, "Objectives failed to render")
assert(objectives.AbsolutePosition.Y >= hud.AbsolutePosition.Y + hud.AbsoluteSize.Y, "HUD overlaps objectives")
local title = objectives:FindFirstChild("ObjectiveTitle", true)
assert(title and title.TextFits == true, "Objective title is clipped")
print("AppleUI basic layout assertions passed at viewport", workspace.CurrentCamera.ViewportSize)
print("APPLE_UI_THEME_ENGINE_READY", theme)
print("APPLE_UI_LAYOUT " .. game:GetService("HttpService"):JSONEncode({
    theme = theme, viewport = { workspace.CurrentCamera.ViewportSize.X, workspace.CurrentCamera.ViewportSize.Y },
    hud = { hud.AbsolutePosition.X, hud.AbsolutePosition.Y, hud.AbsoluteSize.X, hud.AbsoluteSize.Y },
    visuallyAccepted = false,
}))
print("MANUAL CHECKS STILL REQUIRED: touch/gamepad, narrow/landscape layout, scroll, three confirmed buys, fourth refused, respawn, close/reopen, notifications and cleanup")
