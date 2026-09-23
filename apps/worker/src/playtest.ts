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

// ------------------------------------------------------------------ the player-side check (F-046)
//
// `run_and_check` has no player: RunService:Run() simulates the server only, so a coin counter, a
// LocalScript HUD or a client error cannot be seen by it at all. On 2026-09-23 that is how a customer
// was told a HUD "is verified" while in a real Test session the LocalScript errored ("ResetOnSpawn is
// not a valid member of LocalScript") and PlayerGui held no ScreenGui. The plugin's `play_check` op
// runs a real solo Test session with a player and reports what that player had; this turns the
// report into sentences the model cannot misread as more than they say.

interface PlayLabel { name: string; class?: string; text: string; visible: boolean }
interface PlayGui { name: string; enabled: boolean; labels: PlayLabel[]; truncated?: boolean }
interface PlayLog { message: string; source?: string }
interface PlayStat { name: string; value: number | string }
interface PlayTouch {
  path: string;
  found: boolean;
  moved?: boolean;
  stillInPlace?: boolean;
  transparency?: number;
  leaderstatsAfter?: PlayStat[];
}

/** Roblox Studio puts its own Freecam ScreenGui into PlayerGui in every Test session. */
const STUDIO_OWN_GUIS = new Set(['Freecam']);

const list = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const statText = (stats: PlayStat[]): string => stats.map((s) => `${s.name} ${s.value}`).join(', ');

export interface PlayCheckSummary {
  verdict: 'no_report' | 'no_player' | 'client_errors' | 'server_errors' | 'no_screen_gui' | 'observed';
  playerSees: string;
  clientErrors: string[];
  serverErrors: string[];
  warnings: number;
  leaderstats?: string;
  touches?: string[];
  harness: string;
  note: string;
}

/**
 * Read a plugin `play_check` result. Anything missing is stated as missing: a report the client half
 * never sent is "not observed", never an empty screen, and an empty screen is never a pass.
 */
export function summarisePlayCheck(raw: unknown): PlayCheckSummary {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const harness = d.harnessRemoved === true
    ? 'the temporary check scripts were removed from the place'
    : `WARNING: ${Number(d.harnessRemaining) || 'some'} temporary check script(s) could NOT be removed — tell the user to delete ApplePlayCheckServer / ApplePlayCheckClient`;
  const clientErrors = list<PlayLog>(d.clientErrors).slice(0, 10).map((e) => (e.source ? `${e.message} (${e.source})` : e.message));
  const serverErrors = list<PlayLog>(d.serverErrors).slice(0, 10).map((e) => (e.source ? `${e.message} (${e.source})` : e.message));
  const warnings = list(d.clientWarnings).length + list(d.serverWarnings).length;
  const before = list<PlayStat>(d.leaderstatsBefore);
  const after = list<PlayStat>(d.leaderstatsAfter);
  const leaderstats = d.leaderstatsBefore == null && d.leaderstatsAfter == null
    ? 'the player has no leaderstats folder'
    : `${statText(before) || 'none'} at the start → ${statText(after) || 'none'} at the end`;
  const touches = list<PlayTouch>(d.touches).map((t) => {
    if (!t.found) return `${t.path}: not found in the running game`;
    const parts = [`${t.path}: walked onto it${t.moved === false ? ' (the move failed)' : ''}`];
    if (t.leaderstatsAfter) parts.push(`leaderstats then ${statText(t.leaderstatsAfter) || 'none'}`);
    if (t.stillInPlace === false) parts.push('it was removed');
    if (typeof t.transparency === 'number') parts.push(`Transparency ${t.transparency}`);
    return parts.join(', ');
  });

  const base = { clientErrors, serverErrors, warnings, harness };
  // A harness left in the customer's place is the one thing that must survive truncation, so it
  // leads; otherwise the verdict and what the player sees come first.
  const lead = (r: PlayCheckSummary): PlayCheckSummary => (d.harnessRemoved === true ? r : Object.assign({ harness: r.harness }, r));
  if (d.playerJoined !== true || d.characterSpawned !== true) {
    return lead({
      verdict: 'no_player',
      playerSees: 'NOTHING WAS OBSERVED: no player character spawned within the bound, so nothing on screen was checked.',
      ...base,
      note: `The check stopped at "${String(d.stage ?? 'unknown')}". Do not claim anything about what the player sees.`,
    });
  }
  if (d.clientReported !== true) {
    const guis = list<PlayGui>(d.serverViewScreenGuis).map((g) => g.name);
    return lead({
      verdict: 'no_report',
      playerSees:
        'NOT OBSERVED: the player\'s client never answered, so what is on screen is unknown' +
        (guis.length ? ` (the server saw these ScreenGuis cloned from StarterGui: ${guis.join(', ')}; the server cannot see GUIs a LocalScript builds)` : '') + '.',
      ...base,
      leaderstats,
      ...(touches.length ? { touches } : {}),
      note: 'A UI claim is NOT verified by this check. Say so.',
    });
  }

  const guis = list<PlayGui>(d.screenGuis);
  const own = guis.filter((g) => STUDIO_OWN_GUIS.has(g.name) && g.labels.length === 0);
  const game = guis.filter((g) => !own.includes(g));
  const others = list<{ name: string; class: string }>(d.otherPlayerGuiChildren);
  const lines: string[] = [];
  for (const g of game) {
    const visible = g.labels.filter((l) => l.visible);
    const hidden = g.labels.filter((l) => !l.visible);
    let line = `ScreenGui "${g.name}" (${g.enabled ? 'enabled' : 'DISABLED — the player sees none of it'})`;
    line += visible.length
      ? `: visible text ${visible.map((l) => `"${l.text}" [${l.name}]`).join(', ')}`
      : ': no visible text';
    if (hidden.length) line += `; hidden: ${hidden.map((l) => l.name).join(', ')}`;
    if (g.truncated) line += ' (more elements not listed)';
    lines.push(line);
  }
  const otherText = others.length ? ` PlayerGui also held non-GUI objects: ${others.map((o) => `${o.name} (${o.class})`).join(', ')}.` : '';
  const ownText = own.length ? ` (Studio's own ${own.map((g) => g.name).join(', ')} ScreenGui is not part of the game.)` : '';
  const playerSees = game.length
    ? `The player's screen: ${lines.join(' | ')}.${otherText}${ownText}`
    : `The player's screen has NO game ScreenGui at all — nothing the game built is on screen.${otherText}${ownText}`;

  const verdict: PlayCheckSummary['verdict'] = clientErrors.length
    ? 'client_errors'
    : serverErrors.length
      ? 'server_errors'
      : game.length === 0
        ? 'no_screen_gui'
        : 'observed';
  const note =
    verdict === 'client_errors'
      ? 'Client scripts ERRORED while the player played. A HUD or UI with a client error is broken — fix it and check again; do not call it verified.'
      : verdict === 'server_errors'
        ? 'Server scripts errored during the session. Fix them before reporting the game works.'
        : verdict === 'no_screen_gui'
          ? 'There is no on-screen UI. If the user asked for a counter or HUD, it does not exist yet.'
          : 'This is what one player saw. The screen was read AFTER the touches, so a counter showing the new leaderstats value updated and one showing the old value did not. Claim only what playerSees says.';
  return lead({ verdict, playerSees, ...base, leaderstats, ...(touches.length ? { touches } : {}), note });
}
