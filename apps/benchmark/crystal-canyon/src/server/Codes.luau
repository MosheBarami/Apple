--!strict
--[[
	Crystal Canyon — promo code redemption.

	Codes are a server-only truth, and as of M9 that is true of the LIST as well as the
	decision. The table used to live in `Config`, which replicates to every client — this
	file said so and treated the list as public, while Config's own comment claimed the
	opposite. It now lives in `CodeTable.luau` under ServerScriptService and does not
	replicate. The client posts a raw string and is told yes or no, and nothing here reads a
	client-supplied amount.

	The validation order in `redeem` is the security-relevant part of this file
	and it is deliberate:

	    type -> length -> cooldown -> normalise -> profile -> lookup -> grant

	Length is checked against the RAW string, before trimming, because `#s` is
	O(1) while the trim pattern `^%s*(.-)%s*$` backtracks. Handing an unbounded
	string to that pattern is a cheap way for a client to burn server CPU, so
	the megabyte of whitespace has to die at the `#` comparison, not after it.
]]

local Players = game:GetService("Players")

local CodeTable = require(script.Parent.CodeTable)

local Codes = {}

type Ctx = {
	Config: any,
	Util: any,
	Remotes: Folder,
	Data: any,
	Economy: any,
	Upgrades: any,
	Zones: any,
	Collect: any,
	Codes: any,
	Shop: any,
}

-- Assigned in init. Declared as non-optional so every call site below reads
-- cleanly under --!strict; calling redeem before init is a boot-order bug that
-- should surface loudly rather than be papered over with nil checks.
local ctx: Ctx = nil :: any

-- Player -> os.clock() of the last attempt that got past the type check.
local lastAttempt: { [Player]: number } = {}

-- Player-facing copy. These are UI strings, not economy numbers, so they live
-- here rather than in Config; the one string Config owns is the per-code
-- Message, which is returned verbatim on success.
local MSG_BAD_INPUT = "That code isn't valid."
local MSG_TOO_LONG = "That code is too long."
local MSG_COOLDOWN = "Slow down a moment."
local MSG_NOT_READY = "Your data is still loading."
local MSG_UNKNOWN = "That code isn't valid."
local MSG_ALREADY = "You already used that code."

function Codes.init(context: Ctx)
	ctx = context

	-- Buckets keyed by Player instance leak if the player never comes back, so
	-- drop the entry on leave. A rejoin gets a fresh Player instance and
	-- therefore a fresh cooldown, which is correct: the cooldown exists to slow
	-- a session down, not to survive one.
	Players.PlayerRemoving:Connect(function(player)
		lastAttempt[player] = nil
	end)
end

--[[ Redeem a code for `player`.

	Returns `(ok, message)`. The message is always populated and is safe to show
	to the player verbatim — on success it is the Message the config author
	wrote for that code.

	`code` is typed as a string to match the architecture contract, but it is
	runtime-checked anyway. Net validates arguments before it dispatches here,
	yet this function is reachable from any server code and the contract has to
	hold without assuming a particular caller did the work first. ]]
function Codes.redeem(player: Player, code: string): (boolean, string)
	if typeof(code) ~= "string" then
		return false, MSG_BAD_INPUT
	end

	local Config = ctx.Config

	-- O(1), and it happens before anything touches the string contents.
	if #code > Config.CodeInput.MaxLength then
		return false, MSG_TOO_LONG
	end

	-- The cooldown is armed on every well-formed attempt, not only successful
	-- ones. Charging failures is the whole point: without it, guessing codes is
	-- free and the code list can be enumerated at the remote's rate limit.
	local now = os.clock()
	local previous = lastAttempt[player]
	if previous and (now - previous) < Config.CodeInput.CooldownSeconds then
		return false, MSG_COOLDOWN
	end
	lastAttempt[player] = now

	-- Bounded by MaxLength above, so the backtracking trim is safe here.
	local normalised = code:match("^%s*(.-)%s*$") or ""
	normalised = normalised:upper()
	if normalised == "" then
		return false, MSG_BAD_INPUT
	end

	-- A player whose profile failed to load must never be granted anything;
	-- writing to a placeholder profile would either be lost or, worse, saved
	-- over a real one later.
	if not ctx.Data.isReady(player) then
		return false, MSG_NOT_READY
	end
	local profile = ctx.Data.get(player)
	if not profile then
		return false, MSG_NOT_READY
	end

	local entry = CodeTable[normalised]
	if not entry then
		return false, MSG_UNKNOWN
	end

	if profile.codes[normalised] then
		return false, MSG_ALREADY
	end

	-- Mark redeemed BEFORE granting. Nothing in the grant path yields today, so
	-- there is no interleaving window, but ordering it this way means the flag
	-- is the thing that has to be wrong for a double-grant to happen — and the
	-- failure mode of the wrong order (grant, then yield, then grant again) is
	-- duplicated currency, which is the one bug this game cannot ship.
	profile.codes[normalised] = true

	local reward = entry.Reward
	if type(reward) == "table" and type(reward.coins) == "number" and reward.coins > 0 then
		ctx.Economy.addCoins(player, math.floor(reward.coins))
	end

	-- The client renders only what Sync tells it, so a grant that does not push
	-- is a grant the player cannot see.
	ctx.Economy.push(player)

	return true, tostring(entry.Message)
end

return Codes
