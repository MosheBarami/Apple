/**
 * THE ORIGINAL CREATOR'S PRIVATE SOUNDS ARE SILENCED, NOT LEFT TO SHOUT (owner, 2026-09-30). A game from the library carries the
 * sounds of the creator who made it; many are private to that creator, so every play filled the Output with red
 * "Failed to load sound rbxassetid://… User is not authorized to access Asset." lines a real person must never see.
 * After the build, Studio itself is asked which sound ids it can load (ContentProvider:PreloadAsync, the ground truth); a Sound
 * whose id cannot load gets an empty SoundId and keeps its name and place (scripts wait for them by name, e.g. WaitForChild
 * "OldMusic"), with the old id kept in the AppleSilenced attribute. Sounds a script picks at run time are not reached here.
 */
export const SILENCE_LUAU = `
local ContentProvider = game:GetService("ContentProvider")
local byId, ids = {}, {}
for _, name in { "Workspace", "SoundService", "ReplicatedStorage", "ReplicatedFirst", "StarterGui", "StarterPack", "StarterPlayer", "ServerStorage", "Lighting" } do
	local ok, service = pcall(game.GetService, game, name)
	if ok and service then
		for _, d in service:GetDescendants() do
			if d:IsA("Sound") and d.SoundId ~= "" then
				local list = byId[d.SoundId]
				if not list then
					list = {}
					byId[d.SoundId] = list
					if #ids < 400 then table.insert(ids, d.SoundId) end
				end
				table.insert(list, d)
			end
		end
	end
end
local failed = {}
if #ids > 0 then
	ContentProvider:PreloadAsync(ids, function(id, status)
		if status == Enum.AssetFetchStatus.Failure then table.insert(failed, id) end
	end)
end
local silenced = 0
for _, id in failed do
	for _, s in byId[id] or {} do
		s:SetAttribute("AppleSilenced", id)
		s.SoundId = ""
		silenced += 1
	end
end
return "silence " .. #ids .. " " .. #failed .. " " .. silenced
`;

/** Read {checked, failed, silenced} back out of whatever run_code wrapped it in; undefined when the answer is not that. */
export function parseSilenced(raw: unknown): { checked: number; failed: number; silenced: number } | undefined {
  const m = /silence (\d+) (\d+) (\d+)/.exec(JSON.stringify(raw ?? null));
  return m ? { checked: Number(m[1]), failed: Number(m[2]), silenced: Number(m[3]) } : undefined;
}
