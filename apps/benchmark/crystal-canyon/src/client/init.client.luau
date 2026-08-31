--!strict
--[[
	Crystal Canyon — client boot.

	This LocalScript is the only place on the client that talks to the network.
	Its whole job is to be the single source of client truth:

	  Sync arrives -> `state` is replaced -> every surface re-renders from it.

	No client module keeps its own copy of the player's coins, levels or zones.
	That is deliberate. The classic simulator bug is a HUD that decrements coins
	optimistically on click while the shop panel waits for the server, and the
	two disagree for a second. Here there is nothing to disagree about: the HUD,
	the panels and the objective chip are all pure functions of one table that
	only the server writes.

	The other half of the same rule: this script sends INTENT only. `purchase`
	posts an upgrade id, `sell` posts nothing at all. Never an amount, never a
	claim. The authoritative answer comes back as the next Sync.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer

local root = ReplicatedStorage:WaitForChild("CrystalCanyon", 30)
assert(root, "CrystalCanyon shared folder never replicated")

local Config = require(root:WaitForChild("Config")) :: any
local Remotes = require(root:WaitForChild("Remotes")) :: any
local Palette = require(root:WaitForChild("Palette")) :: any
local Util = require(root:WaitForChild("Util")) :: any

-- Module loading ----------------------------------------------------------

--[[ A module that fails to load or fails to init must not take the rest of the
	 UI with it. A half-drawn HUD a player can still sell from is recoverable; a
	 black screen is not. Every failure below is logged with the module's name so
	 the console names the culprit instead of pointing at this boot script. ]]
local function loadModule(name: string): any?
	local inst = script:WaitForChild(name, 10)
	if not inst then
		warn(`[CrystalCanyon] client module "{name}" never appeared; continuing without it`)
		return nil
	end

	local ok, result = pcall(require, inst)
	if not ok then
		warn(`[CrystalCanyon] client module "{name}" failed to load: {result}`)
		return nil
	end
	return result
end

local Theme = loadModule("Theme")
local Hud = loadModule("Hud")
local Panels = loadModule("Panels")
local Effects = loadModule("Effects")
local Objective = loadModule("Objective")

-- Remotes -----------------------------------------------------------------
-- Remotes.get yields; grabbing all of them up front means no render path ever
-- has to wait on the network mid-frame.

local SyncRemote = Remotes.get("Sync")

--[[ Resolved but not bound to a name: Effects owns the Pop/Notify/Unlocked
	 subscriptions (see below). Touching them here still pays the WaitForChild
	 cost up front, so `Effects.init` — which calls `Remotes.get` for the same
	 three — returns without yielding mid-boot. ]]
Remotes.get("Notify")
Remotes.get("Pop")
Remotes.get("Unlocked")

local PurchaseRemote = Remotes.get("Purchase")
local SellRemote = Remotes.get("Sell")
local RedeemRemote = Remotes.get("Redeem")
local UnlockRemote = Remotes.get("Unlock")

-- Screen surface ----------------------------------------------------------

local playerGui = player:WaitForChild("PlayerGui") :: PlayerGui

--[[ ResetOnSpawn = false is what keeps this GUI alive across deaths. Without
	 it Roblox destroys and re-creates the ScreenGui on every respawn, every
	 module's cached Instance references go stale, and the UI silently stops
	 updating. Because the GUI survives, boot must also run exactly once — so a
	 leftover ScreenGui from a previous run of this script is destroyed rather
	 than stacked on top of. ]]
local existing = playerGui:FindFirstChild("CrystalCanyonUI")
if existing then
	existing:Destroy()
end

local screen = Instance.new("ScreenGui")
screen.Name = "CrystalCanyonUI"
screen.ResetOnSpawn = false
screen.IgnoreGuiInset = true
screen.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
screen.DisplayOrder = 10
screen.Parent = playerGui

-- Client truth ------------------------------------------------------------

--[[ The last Sync, and nothing else. `nil` until the server has loaded the
	 profile — surfaces render an empty/loading state from that rather than
	 inventing zeroes that would briefly read as "you have no coins". ]]
local state: any = nil

local ctx: any = {}

-- Intent ------------------------------------------------------------------

--[[ Fire-and-forget, every one of them. Nothing here optimistically edits
	 `state`: if the server refuses (no funds, too far from the pad, rate
	 limited) the UI must not have already shown the purchase succeeding. The
	 only visible confirmation is the Sync that follows. ]]
local intent = {}

function intent.purchase(upgradeId: string)
	if type(upgradeId) ~= "string" then
		return
	end
	PurchaseRemote:FireServer(upgradeId)
end

function intent.sell()
	SellRemote:FireServer()
end

function intent.redeem(code: string)
	if type(code) ~= "string" then
		return
	end
	-- Trimming and casing are the server's decision (Codes.redeem), but there is
	-- no reason to spend a rate-limit token on an empty box.
	if code:match("^%s*$") then
		return
	end
	RedeemRemote:FireServer(code)
end

function intent.unlock(zoneId: string)
	if type(zoneId) ~= "string" then
		return
	end
	UnlockRemote:FireServer(zoneId)
end

--[[ Panel routing lives here rather than inside Hud so the HUD does not need a
	 reference to Panels. Hud raises "the player pressed Shop"; this decides what
	 that means. Panels enforces the one-open-at-a-time rule itself. ]]
function intent.openPanel(panelId: string)
	if not Panels or type(Panels.open) ~= "function" then
		return
	end
	local ok, err = pcall(Panels.open, panelId)
	if not ok then
		warn(`[CrystalCanyon] Panels.open("{panelId}") errored: {err}`)
	end
end

function intent.closePanel()
	if not Panels or type(Panels.close) ~= "function" then
		return
	end
	pcall(Panels.close)
end

--[[ The four `c2s` remotes, keyed by the name Panels uses when it calls
	 `deps.send("Purchase", id)`. Handing modules the remotes rather than letting
	 them call `Remotes.get` themselves keeps the "one place talks to the
	 network" rule in the header true. ]]
local c2s: { [string]: RemoteEvent } = {
	Purchase = PurchaseRemote,
	Sell = SellRemote,
	Redeem = RedeemRemote,
	Unlock = UnlockRemote,
}

--[[ Panels' generic dispatcher. It routes through the typed `intent` functions
	 above rather than firing `c2s[name]` directly, so the argument checks (and
	 the empty-code guard) live in exactly one place and a panel cannot skip
	 them by picking the generic path. ]]
local function send(name: string, ...: any)
	if name == "Purchase" then
		intent.purchase(...)
	elseif name == "Sell" then
		intent.sell()
	elseif name == "Redeem" then
		intent.redeem(...)
	elseif name == "Unlock" then
		intent.unlock(...)
	else
		warn(`[CrystalCanyon] ignoring send to unknown remote "{name}"`)
	end
end

--[[ The dependency table every module's `init` is handed.

	 This is a SUPERSET of what any one surface declares, and each key below
	 exists because a module asserts on it by that exact name — `Hud.init` wants
	 `openPanel` and `remotes.Sell`, `Panels.init` wants `Theme`, `gui` and
	 `send`. An earlier version of this file passed a table of generic context
	 (Config/Palette/player/...) and nothing else, so both asserts fired, both
	 pcalls swallowed the error, and a real client booted to an empty screen with
	 no HUD and no modals. Adding a key here without a module that reads it is
	 harmless; removing one that a module asserts on disables that whole
	 surface silently. ]]
ctx.Config = Config
ctx.Palette = Palette
ctx.Util = Util
ctx.Theme = Theme
ctx.player = player
ctx.playerGui = playerGui
ctx.screen = screen
ctx.gui = screen -- Panels.init: the ScreenGui its modal layer is parented to
ctx.remotes = c2s -- Hud.init: reads remotes.Sell
ctx.openPanel = intent.openPanel -- Hud.init: asserts this is a function
ctx.closePanel = intent.closePanel
ctx.send = send -- Panels: send("Purchase"|"Redeem"|"Unlock", ...)
ctx.intent = intent
ctx.getState = function()
	return state
end

-- Init --------------------------------------------------------------------

--[[ Theme is pure helpers and may legitimately have no init; the rest are
	 surfaces. A module that throws during init is dropped from the render fan-out
	 entirely, because a surface that failed to build its instances will throw on
	 every one of the ~10 Syncs a second that follow. ]]
local surfaces: { { name: string, module: any } } = {}

--[[ Returns whether the module is live. Callers need that answer: Objective's
	 mount point only exists if Hud actually finished initialising. ]]
local function initModule(name: string, module: any, arg: any): boolean
	if not module then
		return false
	end
	if type(module.init) == "function" then
		local ok, err = pcall(module.init, arg)
		if not ok then
			warn(`[CrystalCanyon] {name}.init failed, disabling that surface: {err}`)
			return false
		end
	end
	if type(module.render) == "function" then
		table.insert(surfaces, { name = name, module = module })
	end
	return true
end

initModule("Theme", Theme, ctx)
local hudReady = initModule("Hud", Hud, ctx)
initModule("Panels", Panels, ctx)

--[[ Objective.init and Effects.init take an INSTANCE to parent into, not a
	 context table — they do `frame.Parent = mountPoint`. Hud owns the top-centre
	 slot and exposes it as `Hud.objectiveMount()`; if the HUD failed to build we
	 fall back to this script's ScreenGui so the chip still renders somewhere
	 legible instead of vanishing with the HUD. ]]
local objectiveMount: Instance = screen
if hudReady and Hud and type(Hud.objectiveMount) == "function" then
	local ok, mount = pcall(Hud.objectiveMount)
	if ok and typeof(mount) == "Instance" then
		objectiveMount = mount
	else
		warn(
			`[CrystalCanyon] Hud.objectiveMount() unavailable, mounting the objective chip on the root ScreenGui: {mount}`
		)
	end
end

initModule("Objective", Objective, objectiveMount)
initModule("Effects", Effects, screen)

-- Render fan-out ----------------------------------------------------------

--[[ One warning per module, ever. A render that throws will throw again on the
	 next Sync ten times a second; unthrottled that floods the console until the
	 real first error scrolls out of reach. ]]
local warned: { [string]: boolean } = {}

local function render()
	if state == nil then
		return
	end
	for _, entry in surfaces do
		local ok, err = pcall(entry.module.render, state)
		if not ok and not warned[entry.name] then
			warned[entry.name] = true
			warn(`[CrystalCanyon] {entry.name}.render errored (further errors suppressed): {err}`)
		end
	end
end

-- Server -> client --------------------------------------------------------

SyncRemote.OnClientEvent:Connect(function(snapshot: any)
	-- A malformed snapshot must not blank the UI: keep showing the last good
	-- state rather than rendering nothing.
	if type(snapshot) ~= "table" then
		return
	end
	state = snapshot
	render()
end)

--[[ Pop / Notify / Unlocked are subscribed by `Effects.init`, and ONLY there.

	 The codes panel also needs the server's redeem verdict, and used to get it by
	 opening a SECOND connection to `Notify` — so every verdict rendered twice and
	 the panel and the toast classified severity independently. It now registers
	 through `Effects.onNotify`, which fans each notification out to subscribers
	 after queueing the toast and hands them Effects' own resolved accent colour.
	 One subscription, one classification, two surfaces that cannot disagree.

	 This script used to also forward those three, which was wrong twice over.
	 It called `Effects.pop(payload)` — binding the whole `{position, text,
	 color}` table to the `position` parameter — and `Effects.unlocked`, which
	 does not exist (the function is `Effects.celebrate`). The pop path was the
	 damaging one: it threw *after* the pool entry was marked busy, so every
	 collect stranded a slot until the pool was exhausted and number pops stopped
	 for good, including for the correct handler.

	 Effects owns them because that is where the payload shape is validated and
	 the audio cue is fired; a second subscriber here could only ever duplicate
	 or contradict it. `SyncRemote` above stays this script's, because `state` is
	 this script's. ]]

-- Character lifecycle -----------------------------------------------------

--[[ The GUI survives respawn, so the danger is the mirror image of the usual
	 one: not a duplicated interface, but connections to a dead character piling
	 up one per death. Everything bound to a specific character goes in this
	 list and is dropped the moment the next one arrives. ]]
local characterConnections: { RBXScriptConnection } = {}

local function clearCharacterConnections()
	for _, conn in characterConnections do
		conn:Disconnect()
	end
	table.clear(characterConnections)
end

local function onCharacter(character: Model)
	clearCharacterConnections()

	-- Optional hook: a surface that needs the live character (billboard anchors,
	-- pad proximity affordances) gets it here instead of polling for it.
	for _, entry in surfaces do
		local hook = entry.module.onCharacter
		if type(hook) == "function" then
			local ok, err = pcall(hook, character)
			if not ok then
				warn(`[CrystalCanyon] {entry.name}.onCharacter errored: {err}`)
			end
		end
	end

	-- Re-render against the state we already hold. The server pushes a Sync on
	-- spawn too, but this closes the window where a surface that rebuilt an
	-- instance on respawn would sit blank until the next tick.
	render()

	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if humanoid then
		table.insert(
			characterConnections,
			humanoid.Died:Connect(function()
				-- Death is the one moment a modal is guaranteed to be in the way.
				intent.closePanel()
			end)
		)
	end
end

player.CharacterAdded:Connect(onCharacter)
if player.Character then
	onCharacter(player.Character)
end

-- If Sync landed while modules were still initialising, draw it now.
render()
