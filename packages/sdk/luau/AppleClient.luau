--!strict
--[[
	AppleClient — the former name of StudPilotClient, kept for one release so an existing
	`require(script.AppleClient)` keeps working. It IS StudPilotClient: the same table, not a copy.
	New code requires StudPilotClient. Removal: next major.
]]

return require(script.Parent.StudPilotClient)
