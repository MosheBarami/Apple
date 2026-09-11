--!strict
--[[
	Crystal Canyon — the gate, as the player sees it.

	## What this module is for

	`Zones.luau` on the server ends its header with: "the server publishes each player's
	state as a `zone_<id>` attribute, and the client reads that attribute to draw its own
	copy of the gate solid-red-and-opaque or open."

	Nothing read it. The attribute was published correctly on load, on unlock and on
	respawn, and no code anywhere called `GetAttribute("zone_…")`. `Palette.Pads.GateOpen`
	was defined for this and had zero consumers. The consequences were both directions of
	the same silence: a player who paid 2,500 coins saw the gate look exactly as it had a
	second earlier, and a player who had not paid walked through an identical-looking gate
	and collected nothing. This module is that missing half. See H1 in docs/FAILURES.md.

	## Why recolouring a replicated part is safe here

	The gate is one instance owned by the server, but a property written by a LocalScript
	is not replicated — the change is this client's alone. That is precisely what the
	server's design needs, and it is why `prepareGates` paints the locked colour once and
	then, in its own words, "never repaints it": a shared part's colour cannot carry
	per-player meaning, so the server sets the pessimistic state and leaves the per-player
	truth to run here.

	## This module changes nothing about who may collect

	Collision stays off and enforcement stays in `Collect`, which awards nothing in a zone
	`Zones.isUnlocked` says is locked. Making the gate look open for a player who owns the
	zone is decoration catching up with the truth, not a new permission. An exploiter who
	forces this module to paint "open" has painted a wall, and still earns nothing.
]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local root = ReplicatedStorage:WaitForChild("CrystalCanyon")
local Config = require(root:WaitForChild("Config")) :: any
local Palette = require(root:WaitForChild("Palette")) :: any

local Gates = {}

local ATTR_PREFIX = "zone_"

-- Opaque enough to read as a wall, translucent enough to see the zone behind it — the
-- point of the locked gate is to advertise what is on the other side.
local LOCKED_TRANSPARENCY = 0.35
local OPEN_TRANSPARENCY = 0.88
local FADE_SECONDS = 0.45

--[[ How long to wait for the world. Gates are built at edit time, so they are normally
	 present before this runs; the wait covers a client that finished booting before
	 Workspace finished replicating. Giving up is not fatal — an unpainted gate is the
	 state the game shipped with, which is exactly what this module improves on. ]]
local WORLD_TIMEOUT = 20

local connections: { RBXScriptConnection } = {}

--[[ The gate MODEL per zone, and the state last published for it — never a snapshot of
	 the model's parts.

	 The first version of this module cached `GetDescendants()` at init and painted that
	 list. It found the gate, warned about nothing, and applied the colour to zero parts:
	 at client boot the gate Model exists before its 13 children have replicated, so the
	 snapshot was empty. That is the same failure as H1 itself — code that runs and
	 affects nothing — and only a Studio playtest surfaced it, because an empty list is
	 indistinguishable from success everywhere else. See F-29 in docs/FAILURES.md.

	 So: walk the descendants at paint time (a gate is a dozen parts, and this runs on an
	 attribute change, not per frame), and colour late arrivals as they appear. ]]
local gateOf: { [string]: Instance } = {}
local stateOf: { [string]: boolean } = {}

local function partsOf(gate: Instance): { BasePart }
	local parts: { BasePart } = {}
	if gate:IsA("BasePart") then
		table.insert(parts, gate)
	end
	for _, d in gate:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(parts, d)
		end
	end
	return parts
end

local function appearance(unlocked: boolean): (Color3, number)
	if unlocked then
		return Palette.Pads.GateOpen, OPEN_TRANSPARENCY
	end
	return Palette.Pads.Gate, LOCKED_TRANSPARENCY
end

--[[ Paint one gate. `instant` skips the fade for the first paint after boot or a
	 respawn, where a gate fading in from the wrong colour would read as a glitch
	 rather than as a transition. ]]
local function paint(zoneId: string, unlocked: boolean, instant: boolean)
	local gate = gateOf[zoneId]
	if not gate then
		return
	end
	stateOf[zoneId] = unlocked

	local colour, transparency = appearance(unlocked)

	for _, part in partsOf(gate) do
		if instant then
			part.Color = colour
			part.Transparency = transparency
		else
			-- Theme.motion, not TweenService: it collapses to an instant set when the
			-- player has reduced motion enabled, and a gate is exactly the kind of
			-- large moving colour field that setting exists for.
			local Theme = Gates._theme
			if Theme and Theme.motion then
				Theme.motion
					:Create(part, TweenInfo.new(FADE_SECONDS), {
						Color = colour,
						Transparency = transparency,
					})
					:Play()
			else
				part.Color = colour
				part.Transparency = transparency
			end
		end
	end
end

--[[ Find the gate for a zone. The server tags each one with a `zoneId` attribute
	 precisely "so the client can find the one it needs without a name convention of its
	 own", so the attribute is tried first and the name is the fallback. ]]
local function findGate(gates: Instance, zoneId: string): Instance?
	for _, child in gates:GetChildren() do
		if child:GetAttribute("zoneId") == zoneId then
			return child
		end
	end
	return gates:FindFirstChild(zoneId)
end

function Gates.init(ctx: any)
	local player = (ctx and ctx.player) or Players.LocalPlayer
	assert(player, "Gates.init needs a player")
	Gates._theme = ctx and ctx.Theme

	local canyon = Workspace:WaitForChild("Canyon", WORLD_TIMEOUT)
	local gates = canyon and canyon:WaitForChild("Gates", WORLD_TIMEOUT)
	if not gates then
		warn("[CrystalCanyon] no Canyon.Gates in Workspace; gates will not reflect ownership")
		return
	end

	for _, zone in Config.Zones do
		local gate = findGate(gates, zone.Id)
		if not gate then
			warn(`[CrystalCanyon] no gate part for zone "{zone.Id}"; its state will not be drawn`)
			continue
		end

		gateOf[zone.Id] = gate

		-- A part that replicates after this point still gets the current state. Without
		-- this the module would be correct only for players whose gate happened to finish
		-- replicating before they booted.
		local zoneId = zone.Id
		table.insert(
			connections,
			gate.DescendantAdded:Connect(function(descendant)
				if descendant:IsA("BasePart") then
					local colour, transparency = appearance(stateOf[zoneId] == true)
					descendant.Color = colour
					descendant.Transparency = transparency
				end
			end)
		)

		local attribute = ATTR_PREFIX .. zone.Id
		-- The attribute may not have arrived yet: Zones publishes it once the profile
		-- loads, which can be after this runs. `nil` is drawn as locked, matching what
		-- Collect will actually award until the server says otherwise — the same
		-- pessimistic default publishWhenReady falls back to on a load timeout.
		paint(zone.Id, player:GetAttribute(attribute) == true, true)

		table.insert(
			connections,
			player:GetAttributeChangedSignal(attribute):Connect(function()
				paint(zone.Id, player:GetAttribute(attribute) == true, false)
			end)
		)
	end
end

--[[ Nothing calls this today — the client boot has no teardown phase — but the
	 connections are held rather than dropped on the floor so that adding one is a
	 two-line change rather than a leak hunt. ]]
function Gates.stop()
	for _, connection in connections do
		connection:Disconnect()
	end
	table.clear(connections)
	table.clear(gateOf)
	table.clear(stateOf)
end

return Gates
