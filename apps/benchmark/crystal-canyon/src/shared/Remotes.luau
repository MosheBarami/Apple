--!strict
--[[
	Crystal Canyon — the entire network surface, declared in one place.

	Two rules this module exists to enforce:

	1. NO RemoteFunctions. Nothing in this game grants a resource through a
	   return value, and the server never yields waiting on a client. Every
	   exchange is a fire-and-forget event; the authoritative answer always
	   comes back on `Sync`, which is server-pushed state, not a reply.

	2. Client->server events carry INTENT ONLY. "I want to buy pack" — never
	   "I bought pack" and never an amount. The server decides what happened.
	   That asymmetry is why an exploiter editing the client cannot mint coins.
]]

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = {}

local ROOT_NAME = "CrystalCanyon"
local FOLDER_NAME = "Remotes"

-- name -> direction, documented so a reader can audit the trust boundary by
-- reading one table instead of grepping the codebase.
Remotes.Definitions = {
	-- server -> client
	Sync = "s2c", -- full authoritative player state; the client renders only this
	Notify = "s2c", -- { kind: string, text: string } toast
	Pop = "s2c", -- { position: Vector3, text: string, color: Color3 } world number pop
	Unlocked = "s2c", -- { zoneId: string } celebration cue

	-- client -> server (intent only, never amounts)
	Purchase = "c2s", -- (upgradeId: string)
	--[[ The shop's three verbs, which are the whole answer to V7: upgrades has one (buy a
		 level) and the shop has three. `Equip` accepts "" to unequip — `oneString` passes an
		 empty string through, rejecting only non-strings and over-long ones, which is what
		 makes the empty case expressible without a fourth remote. ]]
	BuyItem = "c2s", -- (itemId: string)
	UseItem = "c2s", -- (itemId: string)
	Equip = "c2s", -- (trailId: string; "" unequips)
	Sell = "c2s", -- ()
	Redeem = "c2s", -- (code: string)
	Unlock = "c2s", -- (zoneId: string)
}

--[[ Server-side: create the folder and every remote declared above.
	 Idempotent, so re-running the installer in a live place does not duplicate
	 remotes or orphan the client's references. ]]
function Remotes.build(): Folder
	local root = ReplicatedStorage:FindFirstChild(ROOT_NAME)
	if not root then
		root = Instance.new("Folder")
		root.Name = ROOT_NAME
		root.Parent = ReplicatedStorage
	end

	local folder = root:FindFirstChild(FOLDER_NAME)
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = FOLDER_NAME
		folder.Parent = root
	end

	for name in Remotes.Definitions do
		if not folder:FindFirstChild(name) then
			local ev = Instance.new("RemoteEvent")
			ev.Name = name
			ev.Parent = folder
		end
	end

	return folder :: Folder
end

--[[ Client-side accessor. Yields until the remote exists, which it will as
	 soon as the server script has run; a LocalScript can start before the
	 server finishes wiring, and this is the only correct way to bridge that. ]]
function Remotes.get(name: string): RemoteEvent
	assert(Remotes.Definitions[name], `unknown remote "{name}"`)
	local root = ReplicatedStorage:WaitForChild(ROOT_NAME, 30)
	assert(root, "CrystalCanyon folder never replicated")
	local folder = root:WaitForChild(FOLDER_NAME, 30)
	assert(folder, "CrystalCanyon.Remotes never replicated")
	local ev = folder:WaitForChild(name, 30)
	assert(ev and ev:IsA("RemoteEvent"), `remote "{name}" missing or wrong class`)
	return ev :: RemoteEvent
end

return Remotes
