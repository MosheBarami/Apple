// Making a playtest safe, and the measurement that proved it was not.
//
// THE HAZARD, reproduced in a live Studio session on 2026-08-31 rather than inferred.
//
// `run_and_check` is offered to the agent as "Playtest verification ... Use after building to verify
// nothing errors". It calls `RunService:Run()`, which is Studio's **Run** (F8), not Play Solo (F5).
// Run does not create a separate play DataModel: server scripts execute against the EDIT DataModel,
// the one holding the user's committed work, and `RunService:Stop()` does not revert them.
//
// Controlled reproduction, script-free control first:
//
//   pre-run     children=[Baseplate,Camera,ReproA,ReproB,ReproModel,Terrain]  A.debugId=0_483518
//   during-run  children=[Baseplate,Camera,ReproA,ReproB,ReproModel,Terrain]  A.debugId=0_483518
//   after-stop  children=[Baseplate,Camera,ReproA,ReproB,ReproModel,Terrain]  (+3s, +8s identical)
//
// Run/Stop alone is harmless, and the unchanged debugId proves it is the same DataModel, not a copy.
// Now add one server Script that destroys two instances on startup — the kind of "tidy up leftovers
// before building" line an agent writes without thinking:
//
//   pre-run        children=[Baseplate,Camera,ReproA,ReproB,ReproModel,Terrain]
//   during-run     children=[Baseplate,Camera,ReproA,Terrain]
//   after-stop     children=[Baseplate,Camera,ReproA,Terrain]
//   after-stop+8s  children=[Baseplate,Camera,ReproA,Terrain]
//
// ReproB and ReproModel are gone permanently. Nothing errored and nothing was reported. A user who
// asked Golem to "check my game runs" could lose a build to it and never be told.
//
// THE RULE THIS FILE ENFORCES: a playtest either preserves the project, or restores it and says so.
// Current Apple uses the typed `project_census` read op around `run_mode`, plus snapshot/restore for
// the safety net. The legacy CENSUS_LUAU string remains exported for compatibility tests and older
// clients, but the current worker no longer needs arbitrary plugin-context code to count the place.

/**
 * Census of what exists, cheap enough to run either side of a playtest. Counts rather than a full
 * serialize: the checkpoint is the safety net, this is only the tripwire that decides whether the
 * net is needed.
 */
export const CENSUS_LUAU = `
local svc = {"Workspace","ServerScriptService","ServerStorage","ReplicatedStorage","StarterGui","StarterPlayer","Lighting"}
local out, total, parts, scripts = {}, 0, 0, 0
for _, name in ipairs(svc) do
  local s = game:FindFirstChild(name)
  local n = 0
  if s then
    for _, d in ipairs(s:GetDescendants()) do
      n += 1
      if d:IsA("BasePart") then parts += 1 end
      if d:IsA("LuaSourceContainer") then scripts += 1 end
    end
  end
  out[#out + 1] = string.format('"%s":%d', name, n)
  total += n
end
local top = {}
for _, c in ipairs(game.Workspace:GetChildren()) do top[#top + 1] = '"' .. c.Name:gsub('"', "'") .. '"' end
table.sort(top)
return string.format('{"instances":%d,"parts":%d,"scripts":%d,"services":{%s},"topLevel":[%s]}',
  total, parts, scripts, table.concat(out, ","), table.concat(top, ","))
`;

export interface Census {
  instances: number;
  parts: number;
  scripts: number;
  services: Record<string, number>;
  topLevel: string[];
}

/**
 * Read a census back. Returns null on anything unexpected — a broken tripwire must never be read as
 * "nothing was lost".
 */
export function parseCensus(raw: unknown): Census | null {
  // The live wire shape is {"result":{"v":"{...}","t":"string"},"prints":[]} — run_code wraps its
  // return in `result`, and the plugin's Paths.encode wraps THAT as {t, v}. Unwrapping in a fixed
  // order got it wrong twice against real Studio while every unit test passed, so this peels any
  // recognised wrapper until nothing changes, rather than assuming a nesting order.
  let value: unknown = raw;
  for (let i = 0; i < 6; i++) {
    if (!value || typeof value !== 'object') break;
    const o = value as Record<string, unknown>;
    if ('result' in o) { value = o.result; continue; }
    if ('t' in o && 'v' in o) { value = o.v; continue; }
    if ('data' in o) { value = o.data; continue; }
    break;
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const c = value as Partial<Census>;
  if (typeof c.instances !== 'number' || typeof c.parts !== 'number') return null;
  return {
    instances: c.instances,
    parts: c.parts,
    scripts: typeof c.scripts === 'number' ? c.scripts : 0,
    services: c.services && typeof c.services === 'object' ? c.services : {},
    topLevel: Array.isArray(c.topLevel) ? c.topLevel.map(String) : [],
  };
}

/**
 * What the playtest DESTROYED. Growth is ignored on purpose: a running game spawns parts, and a
 * scene that gained instances has lost nothing. Only losses are reported and only losses trigger a
 * restore — otherwise every playtest of a game that spawns a projectile would roll itself back.
 */
export function destructiveDelta(before: Census, after: Census): string[] {
  const lost: string[] = [];
  const gone = before.topLevel.filter((n) => !after.topLevel.includes(n));
  if (gone.length) {
    lost.push(`${gone.length} top-level object${gone.length === 1 ? '' : 's'} destroyed: ${gone.slice(0, 8).join(', ')}`);
  }
  if (after.parts < before.parts) lost.push(`${before.parts - after.parts} parts destroyed (${before.parts} -> ${after.parts})`);
  if (after.scripts < before.scripts) {
    lost.push(`${before.scripts - after.scripts} scripts destroyed (${before.scripts} -> ${after.scripts})`);
  }
  for (const [svc, n] of Object.entries(before.services)) {
    const now = after.services[svc] ?? 0;
    // A service losing a few descendants is normal for a running game — a Humanoid tidying up, a
    // Debris call. A service losing a quarter of itself is not.
    if (n >= 8 && now < n * 0.75) lost.push(`${svc} lost ${n - now} of ${n} descendants`);
  }
  return lost;
}

/** Below this there is nothing worth protecting and a full checkpoint is not worth its cost. */
export const CHECKPOINT_FLOOR_INSTANCES = 12;

/** Should this playtest take a protective checkpoint first? */
export function needsProtection(before: Census | null): boolean {
  // A census we could not read counts as "protect": a broken tripwire is exactly when the safety
  // net matters most.
  if (!before) return true;
  return before.instances >= CHECKPOINT_FLOOR_INSTANCES;
}
