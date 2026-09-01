--!strict
--[[
	Crystal Canyon — the promo codes themselves.

	## Why this is not in Config

	It was, and `Config.Codes` carried this comment:

	    -- Server-only truth. The client never sees this table; it posts a string and
	    -- is told yes or no.

	The second sentence is true. The first was not: `Config` is a ModuleScript under
	ReplicatedStorage that the client requires on boot, so every code, every reward amount and
	every message replicated to every player. `Codes.luau` had noticed and written the honest
	version of the same claim — "treat the *list* as public; what stays server-side is the
	decision" — so the codebase disagreed with itself about whether the list was a secret, and
	the file a reader is most likely to open first held the wrong answer. See M9.

	Rather than soften the claim to match the code, the code now matches the claim. This module
	lives under ServerScriptService, so the list does not replicate.

	## Why it is its own module rather than a local in Codes.luau

	`Profile.sanitize` also reads it — a redeemed-codes map may only contain codes that exist,
	or a corrupt save could carry arbitrary keys forever. Putting the table in `Codes.luau`
	would make `Profile` require `Codes`, and a profile module that depends on a redemption
	service is a cycle waiting to happen. This module requires nothing.

	## What is still shared

	`Config.CodeInput` stays in Config, and should: the client trims the input box to
	`MaxLength`, so it is a rule the interface has to know to avoid promising the player
	something the server will refuse.
]]

export type CodeEntry = {
	Reward: { coins: number? },
	Message: string,
}

--[[ Retiring a code forgets who redeemed it, so re-adding a retired code re-grants it to
	 everyone who ever had it. Ship a new code id instead of resurrecting an old one — the
	 same warning `Profile.sanitize` carries, because that is where the consequence lands. ]]
local CodeTable: { [string]: CodeEntry } = {
	WELCOME = { Reward = { coins = 250 }, Message = "Welcome to the canyon!" },
	CANYON = { Reward = { coins = 500 }, Message = "The canyon rewards you." },
	GOLEM = { Reward = { coins = 1000 }, Message = "Built by Golem." },
}

return CodeTable
