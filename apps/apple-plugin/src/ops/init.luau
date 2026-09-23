-- Apple Studio op families. Each child ModuleScript returns `{ name, build = function(api) ... }`
-- and Commands.luau merges what it builds into the one set of allowlists (OP_FAMILIES.install).
--
-- WHY THIS DIRECTORY EXISTS: Commands.luau is at the edge of Luau's 200-local limit when Studio
-- compiles it at -O0, so new operations cannot be more top-level locals there.
--
-- One family failing to load must not take the others with it, so each is required on its own.
-- A family that is missing reports none of its operations, and the worker offers a family op only
-- when the plugin reports it supported.
-- Each family is named by a literal `require(script.X)` so the build's bundled-require check
-- (scripts/sources.mjs) can prove every one of them ships.
local families = {}
local function load(get: () -> any)
	local ok, family = pcall(get)
	if ok and type(family) == "table" then table.insert(families, family) end
end

return families
