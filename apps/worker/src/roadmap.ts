// The game roadmap: what THIS project should build next, derived from what it actually is.
//
// Manifest §30-§33. The whole value of the feature is in §31's negative: "do not blindly recommend
// Pets/Rebirth to every Roblox project." A roadmap that suggests the same six milestones to a
// tower-defence map and a pet simulator is a template with a progress bar drawn on it, and users
// can tell within one screen. So nothing here is generated from a list of Popular Roblox Features:
// every milestone is selected by what the deterministic scan below found in the place file, and a
// milestone whose genre does not fit is never even a candidate.
//
// §39 ORDER OF OPERATIONS, which is also why this file has no model call in it. Whether a project
// has a DataStore, a currency, a shop UI, a wave spawner or a second zone is a FACT about the
// place, and facts are read, not guessed. One `run_code` op brings back the evidence; regex and
// class counts turn it into features; the catalogue turns features into milestones. A model may
// afterwards reorder the handful of suggestions and rewrite a sentence — `polishRoadmap` takes an
// injected chat function and can only permute and rephrase ids the deterministic pass already
// produced. It cannot add a milestone, cannot mark one done, and its failure is not an error: the
// deterministic roadmap is the product, the model is a coat of paint.
//
// HONESTY. Detection is three-valued on purpose. `present` and `absent` are claims about the
// project; `unknown` is the answer when the scan hit a cap and genuinely could not see (a code-only
// signal in a project whose scripts were truncated). An `unknown` milestone is never presented as
// the confident next step — it is offered with `verify` telling the user Golem could not tell.
import type { StudioOp, OpResult, GolemMode } from '@golem/shared';

// -----------------------------------------------------------------------------------------------
// The scan. ONE Studio round trip.
//
// The alternative — get_tree, then list_scripts, then a read_script per script — is fifteen-plus
// long-poll round trips through a plugin that answers one op at a time, which is seconds of wall
// clock before a single milestone can be computed. `run_code` is understood by every installed
// plugin (see composition.ts LAYOUT_LUAU for the same reasoning) and returns the whole evidence
// bundle at once.
//
// It returns RAW EVIDENCE, never verdicts. No lexicon lives in this string: names, class counts and
// capped script sources come back and every judgement is made in TypeScript, where it is testable
// without a Studio in the loop.
// -----------------------------------------------------------------------------------------------
export const ROADMAP_SCAN_LUAU = `
local HttpService = game:GetService("HttpService")
local okSES, SES = pcall(function() return game:GetService("ScriptEditorService") end)

local SERVICES = {"Workspace","ReplicatedStorage","ReplicatedFirst","ServerScriptService","ServerStorage",
  "StarterGui","StarterPack","StarterPlayer","Lighting","SoundService","Teams"}
local SCRIPT_ROOTS = {"ServerScriptService","ReplicatedStorage","ServerStorage","StarterPlayer","StarterGui",
  "Workspace","ReplicatedFirst","StarterPack"}
local CLASSES = {"SpawnLocation","Humanoid","RemoteEvent","RemoteFunction","BindableEvent","ProximityPrompt",
  "ClickDetector","VehicleSeat","Seat","Sound","Tool","ScreenGui","SurfaceGui","BillboardGui","TextButton",
  "Team","PointLight","SpotLight","SurfaceLight","ParticleEmitter","Beam","Model","Folder",
  "Script","LocalScript","ModuleScript"}

local classes = {}
for _, c in ipairs(CLASSES) do classes[c] = 0 end
local counts = {instances = 0, parts = 0, scripts = 0}
local services, named, lighting, guis = {}, {}, {}, {}
local scanned, namedFull = 0, false
local SCAN_CAP = 40000

for _, svcName in ipairs(SERVICES) do
  local ok, svc = pcall(function() return game:GetService(svcName) end)
  if ok and svc then
    local n = 0
    for _, d in ipairs(svc:GetDescendants()) do
      scanned += 1
      if scanned > SCAN_CAP then break end
      n += 1
      counts.instances += 1
      if d:IsA("BasePart") then counts.parts += 1 end
      if d:IsA("LuaSourceContainer") then counts.scripts += 1 end
      local cn = d.ClassName
      if classes[cn] ~= nil then classes[cn] += 1 end
      if cn == "Model" or cn == "Folder" then
        if #named < 250 then
          named[#named + 1] = {path = "game." .. d:GetFullName(), class = cn, name = d.Name}
        else
          namedFull = true
        end
      end
    end
    services[svcName] = n
  end
end

local okL, L = pcall(function() return game:GetService("Lighting") end)
if okL and L then
  for _, c in ipairs(L:GetChildren()) do lighting[#lighting + 1] = c.ClassName end
end
local okG, G = pcall(function() return game:GetService("StarterGui") end)
if okG and G then
  for _, c in ipairs(G:GetChildren()) do guis[#guis + 1] = c.Name end
end
local top = {}
for _, c in ipairs(workspace:GetChildren()) do top[#top + 1] = c.Name end
-- The place's own name. This is where a Roblox game most often SAYS what it is, and the scan
-- did not capture it at all -- so a place called "Coin Simulator" was invisible to a detector
-- whose strongest signals are all "the place calls itself X".
local placeName = ""
pcall(function() placeName = game.Name end)

local scripts, budget, scriptsFull, srcCut = {}, 60000, false, false
for _, svcName in ipairs(SCRIPT_ROOTS) do
  local ok, svc = pcall(function() return game:GetService(svcName) end)
  if ok and svc then
    for _, d in ipairs(svc:GetDescendants()) do
      if d:IsA("LuaSourceContainer") then
        if #scripts >= 40 then scriptsFull = true; break end
        local src = ""
        if okSES then
          local okSrc, res = pcall(function() return SES:GetEditorSource(d) end)
          if okSrc and typeof(res) == "string" then src = res end
        end
        if src == "" then
          local ok2, res2 = pcall(function() return d.Source end)
          if ok2 and typeof(res2) == "string" then src = res2 end
        end
        local take = math.min(#src, 6000, math.max(0, budget))
        if take < #src then srcCut = true end
        budget -= take
        scripts[#scripts + 1] = {
          path = "game." .. d:GetFullName(),
          class = d.ClassName,
          lines = select(2, string.gsub(src, "\\n", "\\n")) + 1,
          src = string.sub(src, 1, take),
        }
      end
    end
  end
end

return HttpService:JSONEncode({
  counts = counts, services = services, classes = classes, named = named,
  lighting = lighting, guis = guis, topLevel = top, scripts = scripts, place = placeName,
  truncated = {scan = scanned > SCAN_CAP, named = namedFull, scripts = scriptsFull, source = srcCut},
})
`;

/** One script the scan read, with its source capped. */
export interface ScannedScript {
  path: string;
  className: string;
  lines: number;
  source: string;
}

/** A named container in the place — the things a brief can point at by path. */
export interface NamedInstance {
  path: string;
  className: string;
  name: string;
}

/** Raw evidence from one scan. Everything here is a measurement; nothing is a judgement. */
export interface ProjectScan {
  counts: { instances: number; parts: number; scripts: number };
  services: Record<string, number>;
  classes: Record<string, number>;
  named: NamedInstance[];
  lighting: string[];
  guis: string[];
  topLevel: string[];
  /** The place's own name — where a game most often declares its genre. */
  place: string;
  scripts: ScannedScript[];
  /** what the scan could NOT see, so a negative can be reported as "unknown" instead of "no" */
  truncated: { scan: boolean; named: boolean; scripts: boolean; source: boolean };
}

/**
 * Read a scan back out of whatever wrapper run_code returned it in.
 *
 * The unwrapping loop is copied deliberately from parseCensus in playtest.ts: the live shape is
 * {"result":{"t":"string","v":"{...}"}} and assuming a fixed nesting order got that file wrong
 * twice against real Studio. Peel any recognised wrapper until nothing changes.
 */
export function parseScan(raw: unknown): ProjectScan | null {
  let value: unknown = raw;
  for (let i = 0; i < 6; i += 1) {
    if (!value || typeof value !== 'object') break;
    const o = value as Record<string, unknown>;
    if ('result' in o) { value = o.result; continue; }
    if ('t' in o && 'v' in o) { value = o.v; continue; }
    if ('data' in o) { value = o.data; continue; }
    break;
  }
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const s = value as Record<string, unknown>;
  const counts = (s.counts ?? {}) as Record<string, unknown>;
  if (typeof counts.instances !== 'number') return null; // not a scan payload
  const arr = <T>(v: unknown, map: (x: Record<string, unknown>) => T | null): T[] =>
    Array.isArray(v) ? v.flatMap((x) => (x && typeof x === 'object' ? [map(x as Record<string, unknown>)] : [])).filter((x): x is T => x !== null) : [];
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  const nums = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (v && typeof v === 'object') for (const [k, n] of Object.entries(v)) if (typeof n === 'number') out[k] = n;
    return out;
  };
  const t = (s.truncated ?? {}) as Record<string, unknown>;
  return {
    counts: {
      instances: counts.instances,
      parts: typeof counts.parts === 'number' ? counts.parts : 0,
      scripts: typeof counts.scripts === 'number' ? counts.scripts : 0,
    },
    services: nums(s.services),
    classes: nums(s.classes),
    named: arr<NamedInstance>(s.named, (o) =>
      typeof o.name === 'string' ? { path: String(o.path ?? ''), className: String(o.class ?? ''), name: o.name } : null),
    lighting: strs(s.lighting),
    guis: strs(s.guis),
    topLevel: strs(s.topLevel),
    place: typeof s.place === 'string' ? s.place : '',
    scripts: arr<ScannedScript>(s.scripts, (o) =>
      typeof o.path === 'string'
        ? { path: o.path, className: String(o.class ?? 'Script'), lines: typeof o.lines === 'number' ? o.lines : 0, source: String(o.src ?? '') }
        : null),
    truncated: {
      scan: t.scan === true,
      named: t.named === true,
      scripts: t.scripts === true,
      source: t.source === true,
    },
  };
}

/** How the roadmap reaches Studio. Injected so every test runs without a plugin or a network. */
export type StudioProbe = (op: StudioOp, timeoutMs?: number) => Promise<OpResult>;

/** Run the scan against a live project. Returns null when Studio could not answer. */
export async function scanProject(probe: StudioProbe): Promise<{ scan: ProjectScan | null; error: string | null }> {
  const res = await probe({ op: 'run_code', code: ROADMAP_SCAN_LUAU, timeoutMs: 20_000 }, 30_000);
  if (!res.ok) return { scan: null, error: res.error ?? 'Studio did not answer the project scan' };
  const scan = parseScan(res.data);
  if (!scan) return { scan: null, error: 'the project scan came back in a shape this build does not understand' };
  return { scan, error: null };
}

// -----------------------------------------------------------------------------------------------
// Features: the deterministic facts a milestone is judged against.
// -----------------------------------------------------------------------------------------------

export type FeatureId =
  | 'persistence' | 'currency' | 'shop' | 'monetization' | 'remotes' | 'server_logic' | 'client_ui'
  | 'spawn' | 'checkpoints' | 'killbricks' | 'enemies' | 'waves' | 'towers' | 'path_waypoints'
  | 'upgrades' | 'pets' | 'rebirth' | 'leaderboard_global' | 'sound' | 'lighting_mood' | 'tutorial'
  | 'vehicles' | 'teams' | 'dropper' | 'plots' | 'quests' | 'dialogue' | 'daily_reward' | 'badges'
  | 'anticheat' | 'zones' | 'round_system' | 'weapons' | 'racing_track' | 'customization';

/** present = the scan found it; absent = the scan looked and it is not there; unknown = a cap hid it. */
export type Detected = 'present' | 'absent' | 'unknown';

interface Detector {
  id: FeatureId;
  /** matched against the concatenated script sources */
  code?: RegExp;
  /** matched against instance names, script paths, GUI names — the labels a builder chose */
  labels?: RegExp;
  /** [ClassName, minimum count] */
  klass?: [string, number];
  /** human sentence for the evidence trail, filled with what actually matched */
  note: string;
}

// Word-boundary regexes, single-word where possible: a lexicon that fires on substrings reports
// "pet" inside "carpet" and the roadmap starts recommending a pet system to a furniture showcase.
const DETECTORS: readonly Detector[] = [
  { id: 'persistence', code: /\b(?:datastoreservice|getdatastore|getordereddatastore|:setasync|:updateasync|profileservice|datastore2)\b/, note: 'a DataStore call' },
  { id: 'currency', code: /\bleaderstats\b/, labels: /\b(?:coins?|cash|gems?|money|gold|credits?|tokens?|currency)\b/, note: 'a currency' },
  { id: 'shop', labels: /\b(?:shop|store|vendor|market|kiosk)\b/, note: 'a shop surface' },
  { id: 'monetization', code: /\b(?:marketplaceservice|gamepass|promptpurchase|promptgamepasspurchase|promptproductpurchase|processreceipt|developerproduct)\b/, note: 'a Robux purchase path' },
  { id: 'remotes', klass: ['RemoteEvent', 1], code: /\b(?:remoteevent|remotefunction|:fireserver|:invokeserver|:fireclient)\b/, note: 'client/server messaging' },
  { id: 'server_logic', labels: /\bserverscriptservice\b/, note: 'server-side scripts' },
  { id: 'client_ui', klass: ['ScreenGui', 1], note: 'on-screen UI' },
  { id: 'spawn', klass: ['SpawnLocation', 1], note: 'a spawn point' },
  { id: 'checkpoints', klass: ['SpawnLocation', 3], labels: /\b(?:checkpoint|stage\s*\d+|stage\d+)\b/, note: 'staged checkpoints' },
  { id: 'killbricks', code: /\b(?:killbrick|takedamage|humanoid\.health\s*=\s*0)\b/, labels: /\b(?:killbrick|lava|spike|hazard|trap)\b/, note: 'a hazard that kills' },
  { id: 'enemies', labels: /\b(?:enemy|enemies|zombie|mob|monster|bandit|slime|creep|boss)\b/, code: /\b(?:enemyspawn|spawnenemy|enemyfolder)\b/, note: 'enemies' },
  { id: 'waves', code: /\b(?:wave(?:number|count|index|s)?|nextwave|spawnwave|startwave)\b/, labels: /\bwaves?\b/, note: 'a wave system' },
  { id: 'towers', labels: /\b(?:tower|turret|defender|placement)\b/, code: /\b(?:placetower|towerplacement|towerstats)\b/, note: 'towers or turrets' },
  { id: 'path_waypoints', labels: /\b(?:waypoint|nodes?\d*|path\s*\d*|track\d*)\b/, code: /\bwaypoints?\b/, note: 'a path enemies walk' },
  { id: 'upgrades', labels: /\bupgrades?\b/, code: /\b(?:upgrade|levelup|tier)\b/, note: 'upgrades' },
  { id: 'pets', labels: /\b(?:pets?|eggs?|hatch)\b/, code: /\b(?:pethandler|hatchegg|equippet)\b/, note: 'pets' },
  { id: 'rebirth', labels: /\b(?:rebirth|prestige|ascend)\b/, code: /\b(?:rebirth|prestige)\b/, note: 'a rebirth loop' },
  { id: 'leaderboard_global', code: /\b(?:getordereddatastore|ordereddatastore)\b/, labels: /\bleaderboard\b/, note: 'a global leaderboard' },
  { id: 'sound', klass: ['Sound', 1], note: 'audio in the place' },
  { id: 'lighting_mood', note: 'a lighting treatment' }, // resolved structurally below
  { id: 'tutorial', labels: /\b(?:tutorial|onboarding|howtoplay)\b/, code: /\b(?:tutorial|firsttimeplayer|onboarding)\b/, note: 'a tutorial' },
  { id: 'vehicles', klass: ['VehicleSeat', 1], labels: /\b(?:vehicles?|cars?|kart|bike|boat)\b/, note: 'vehicles' },
  { id: 'teams', klass: ['Team', 1], note: 'teams' },
  { id: 'dropper', labels: /\b(?:dropper|conveyor|collector|generator)\b/, code: /\b(?:dropper|conveyor)\b/, note: 'a tycoon income chain' },
  { id: 'plots', labels: /\b(?:plot|base|claim)\b/, code: /\b(?:plotowner|claimplot|ownerid)\b/, note: 'claimable plots' },
  { id: 'quests', labels: /\b(?:quests?|missions?|objectives?)\b/, code: /\b(?:quest|objective|mission)\b/, note: 'quests' },
  { id: 'dialogue', klass: ['ProximityPrompt', 1], labels: /\b(?:npc|dialogue|dialog|shopkeeper|guide)\b/, note: 'NPC interaction' },
  { id: 'daily_reward', labels: /\bdaily\b/, code: /\b(?:dailyreward|dailybonus|loginstreak)\b/, note: 'a daily reward' },
  { id: 'badges', code: /\b(?:badgeservice|awardbadge)\b/, note: 'badges' },
  { id: 'anticheat', code: /\b(?:anticheat|antiexploit|sanitycheck|isvalidrequest|ratelimit)\b/, note: 'server-side validation' },
  { id: 'zones', labels: /\b(?:zone\s*\d*|area\s*\d+|world\s*\d+|island\s*\d*|region\s*\d*|biome)\b/, note: 'named zones' },
  { id: 'round_system', code: /\b(?:intermission|roundstart|matchstart|roundtime)\b/, labels: /\b(?:rounds?|match(?:es)?|lobby|arena)\b/, note: 'rounds or matches' },
  { id: 'weapons', klass: ['Tool', 1], labels: /\b(?:weapons?|swords?|guns?|blaster|bow)\b/, note: 'weapons' },
  { id: 'racing_track', labels: /\b(?:track|lap|finish\s*line|starting\s*grid|circuit)\b/, code: /\b(?:laptime|lapcount|finishline)\b/, note: 'a race track' },
  { id: 'customization', labels: /\b(?:customi[sz]|skins?|outfits?|cosmetics?)\b/, code: /\b(?:customi[sz]ation|equipskin)\b/, note: 'customisation' },
];

/** The searchable views of one scan. Built once; every detector reads these. */
interface ScanIndex {
  code: string;
  labels: string;
  classes: Record<string, number>;
  scan: ProjectScan;
}

/**
 * Blank out Luau comments, preserving everything else.
 *
 * WHY THIS IS NOT OPTIONAL, and it took running the scanner against a real place to see it.
 *
 * `GENRE_SIGNALS` carries weight-3 rules described as "a name the genre wears openly" — a name
 * it wears in its instance names and identifiers. They were matched against raw script text,
 * comments included, and on Crystal Canyon (a shard-collecting simulator) two of them fired on
 * ORDINARY ENGLISH IN PROSE:
 *
 *   racing   <- "this waits for the profile it publishes rather than RACING it"
 *   roleplay <- "a walkspeed of 16 for the rest of the LIFE"
 *
 * Both scored 3, tied, and the alphabet made the place a racing game.
 *
 * A comment is the one part of a file that is deliberately NOT the program. `roblox-antipatterns
 * .mjs` reached the same conclusion and says so: "a comment saying `-- never use wait()` must not
 * fire the deprecated-API rule". Same discipline here.
 *
 * STRING CONTENTS ARE KEPT, deliberately and for the same reason that file does: a genre often
 * announces itself inside a string — `Instance.new("BillboardGui").Text = "LAP 1"` — and the
 * detectors are written to see it. Long strings are scanned so a `--` inside one is not read as
 * a comment start.
 */
export function stripLuauComments(source: string): string {
  const src = String(source ?? '');
  const out: string[] = [];
  const blank = (t: string) => t.replace(/[^\n]/g, ' ');
  let i = 0;
  while (i < src.length) {
    if (src.startsWith('--', i)) {
      const long = /^--(\[=*\[)/.exec(src.slice(i, i + 16));
      if (long?.[1]) {
        const close = `]${'='.repeat(long[1].length - 2)}]`;
        const end = src.indexOf(close, i + long[0].length);
        const stop = end === -1 ? src.length : end + close.length;
        out.push(blank(src.slice(i, stop)));
        i = stop;
        continue;
      }
      const nl = src.indexOf('\n', i);
      const stop = nl === -1 ? src.length : nl;
      out.push(blank(src.slice(i, stop)));
      i = stop;
      continue;
    }
    const longStr = /^\[=*\[/.exec(src.slice(i, i + 16));
    if (longStr) {
      const close = `]${'='.repeat(longStr[0].length - 2)}]`;
      const end = src.indexOf(close, i + longStr[0].length);
      const stop = end === -1 ? src.length : end + close.length;
      out.push(src.slice(i, stop));
      i = stop;
      continue;
    }
    const q = src[i];
    if (q === '"' || q === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== q && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
      const stop = Math.min(j + 1, src.length);
      out.push(src.slice(i, stop));
      i = stop;
      continue;
    }
    out.push(src[i] ?? '');
    i += 1;
  }
  return out.join('');
}

function buildIndex(scan: ProjectScan): ScanIndex {
  const code = scan.scripts.map((s) => stripLuauComments(s.source)).join('\n').toLowerCase();
  const labels = [
    // The place name first: it is the most deliberate statement of intent in the whole scan.
    scan.place ?? '',
    ...scan.named.map((n) => n.name),
    ...scan.topLevel,
    ...scan.guis,
    ...scan.scripts.map((s) => s.path),
  ]
    // strip the path separators so \b works around a name that was a path segment
    .join(' ')
    .replace(/[._/]+/g, ' ')
    // "Zone1" and "Stage12" must read as two tokens for the lexicons above
    .replace(/([a-z])(\d)/gi, '$1 $2')
    .toLowerCase();
  return { code, labels, classes: scan.classes, scan };
}

/** Class names under Lighting that mean somebody deliberately treated the mood. */
const MOOD_CLASSES = new Set(['Atmosphere', 'Sky', 'BloomEffect', 'ColorCorrectionEffect', 'SunRaysEffect', 'DepthOfFieldEffect', 'BlurEffect']);

function detect(ix: ScanIndex, d: Detector): { state: Detected; evidence: string } {
  if (d.id === 'lighting_mood') {
    const found = ix.scan.lighting.filter((c) => MOOD_CLASSES.has(c));
    if (found.length) return { state: 'present', evidence: `Lighting carries ${found.join(', ')}` };
    return { state: 'absent', evidence: 'Lighting has no Atmosphere, Sky or post-effect' };
  }
  if (d.klass && (ix.classes[d.klass[0]] ?? 0) >= d.klass[1]) {
    return { state: 'present', evidence: `${ix.classes[d.klass[0]]} x ${d.klass[0]}` };
  }
  if (d.labels) {
    const m = d.labels.exec(ix.labels);
    if (m) return { state: 'present', evidence: `named "${m[0].trim()}"` };
  }
  if (d.code) {
    const m = d.code.exec(ix.code);
    if (m) return { state: 'present', evidence: `code mentions ${m[0].trim()}` };
  }
  // A negative is only a negative if the scan actually saw the whole project. When scripts or
  // sources were truncated, a code-only signal that did not match is UNKNOWN, not missing.
  const codeOnly = !!d.code && !d.labels && !d.klass;
  if (codeOnly && (ix.scan.truncated.scripts || ix.scan.truncated.source)) {
    return { state: 'unknown', evidence: 'not all script source was read' };
  }
  if (!d.code && !d.labels && !d.klass) return { state: 'unknown', evidence: 'no detector' };
  return { state: 'absent', evidence: `no sign of ${d.note}` };
}

// -----------------------------------------------------------------------------------------------
// Genre. §31's teeth: a milestone whose genre does not match is never a candidate, so a
// tower-defence project cannot be offered a rebirth button no matter what else it contains.
// -----------------------------------------------------------------------------------------------

export type Genre =
  | 'obby' | 'tycoon' | 'simulator' | 'tower_defence' | 'combat' | 'racing'
  | 'horror' | 'roleplay' | 'adventure' | 'showcase' | 'unknown';

export const GENRE_LABEL: Record<Genre, string> = {
  obby: 'obby / parkour',
  tycoon: 'tycoon',
  simulator: 'simulator',
  tower_defence: 'tower defence',
  combat: 'combat / PvP',
  racing: 'racing',
  horror: 'horror',
  roleplay: 'roleplay / hangout',
  adventure: 'adventure / RPG',
  showcase: 'showcase build',
  unknown: 'not yet clear',
};

interface GenreSignal {
  genre: Genre;
  weight: number;
  why: string;
  test: (ix: ScanIndex, has: (f: FeatureId) => boolean) => boolean;
}

/** A name the genre wears openly is worth more than any structural hint. */
function named(ix: ScanIndex, re: RegExp): boolean {
  return re.test(ix.labels) || re.test(ix.code);
}

const GENRE_SIGNALS: readonly GenreSignal[] = [
  // obby
  { genre: 'obby', weight: 3, why: 'the place calls itself an obby', test: (ix) => named(ix, /\b(?:obby|parkour|tower of|difficulty chart)\b/) },
  { genre: 'obby', weight: 2, why: 'staged checkpoints', test: (_, has) => has('checkpoints') },
  { genre: 'obby', weight: 2, why: 'killing hazards', test: (_, has) => has('killbricks') },
  // tycoon
  { genre: 'tycoon', weight: 3, why: 'the place calls itself a tycoon', test: (ix) => named(ix, /\btycoon\b/) },
  { genre: 'tycoon', weight: 2, why: 'a dropper/conveyor income chain', test: (_, has) => has('dropper') },
  { genre: 'tycoon', weight: 2, why: 'claimable plots', test: (_, has) => has('plots') },
  { genre: 'tycoon', weight: 1, why: 'buy buttons', test: (ix) => named(ix, /\bbuy\s*button\b|\bbuybutton\b/) },
  // simulator
  { genre: 'simulator', weight: 3, why: 'the place calls itself a simulator', test: (ix) => named(ix, /\bsimulator\b/) },
  { genre: 'simulator', weight: 2, why: 'pets or eggs', test: (_, has) => has('pets') },
  { genre: 'simulator', weight: 2, why: 'a rebirth loop', test: (_, has) => has('rebirth') },
  { genre: 'simulator', weight: 1, why: 'currency plus upgrades', test: (_, has) => has('currency') && has('upgrades') },
  { genre: 'simulator', weight: 1, why: 'numbered zones', test: (_, has) => has('zones') },
  // tower defence
  { genre: 'tower_defence', weight: 4, why: 'the place calls itself tower defence', test: (ix) => named(ix, /\btower\s*def(?:en[cs]e)\b|\btower defense\b/) },
  { genre: 'tower_defence', weight: 3, why: 'towers plus waves', test: (_, has) => has('towers') && has('waves') },
  { genre: 'tower_defence', weight: 2, why: 'enemies walking a waypoint path', test: (_, has) => has('enemies') && has('path_waypoints') },
  { genre: 'tower_defence', weight: 1, why: 'wave spawning', test: (_, has) => has('waves') },
  // combat
  { genre: 'combat', weight: 3, why: 'the place calls itself PvP/deathmatch', test: (ix) => named(ix, /\b(?:pvp|deathmatch|shooter|fps|battle royale|duel)\b/) },
  { genre: 'combat', weight: 2, why: 'weapons plus teams', test: (_, has) => has('weapons') && has('teams') },
  { genre: 'combat', weight: 1, why: 'a round/match system', test: (_, has) => has('round_system') },
  // racing
  { genre: 'racing', weight: 3, why: 'the place calls itself a race', test: (ix) => named(ix, /\b(?:racing|race track|grand prix|kart)\b/) },
  { genre: 'racing', weight: 2, why: 'a track with laps', test: (_, has) => has('racing_track') },
  { genre: 'racing', weight: 2, why: 'drivable vehicles', test: (_, has) => has('vehicles') },
  // horror
  { genre: 'horror', weight: 3, why: 'the place calls itself horror', test: (ix) => named(ix, /\b(?:horror|scary|nightmare|jumpscare|haunted)\b/) },
  { genre: 'horror', weight: 1, why: 'a flashlight', test: (ix) => named(ix, /\bflashlight\b/) },
  // roleplay
  { genre: 'roleplay', weight: 3, why: 'the place calls itself roleplay/hangout', test: (ix) => named(ix, /\b(?:roleplay|role play|hangout|rp\b|life|town|city)\b/) },
  { genre: 'roleplay', weight: 1, why: 'social rooms (cafe, school, hotel, house)', test: (ix) => named(ix, /\b(?:cafe|restaurant|school|hotel|house|apartment|mall|salon)\b/) },
  { genre: 'roleplay', weight: 1, why: 'seating for players', test: (ix) => (ix.classes.Seat ?? 0) >= 4 },
  // adventure / rpg
  { genre: 'adventure', weight: 3, why: 'the place calls itself an RPG/adventure', test: (ix) => named(ix, /\b(?:rpg|adventure|dungeon|questline)\b/) },
  { genre: 'adventure', weight: 2, why: 'quests', test: (_, has) => has('quests') },
  { genre: 'adventure', weight: 1, why: 'NPCs to talk to', test: (_, has) => has('dialogue') },
  // showcase — the honest reading of a place with geometry and no code
  { genre: 'showcase', weight: 3, why: 'geometry but no scripts at all', test: (ix) => ix.scan.counts.scripts === 0 && ix.scan.counts.parts >= 20 },
  { genre: 'showcase', weight: 1, why: 'the place calls itself a showcase', test: (ix) => named(ix, /\b(?:showcase|gallery|museum|build)\b/) },
];

export interface GenreVerdict {
  genre: Genre;
  /** 0..1 — how much clearer the winner is than the runner-up, not a probability */
  confidence: number;
  evidence: string[];
  runnerUp: { genre: Genre; score: number } | null;
  scores: { genre: Genre; score: number }[];
}

/** Below this the project has not said what it is, and guessing would be the §31 failure. */
const GENRE_FLOOR = 3;

export function detectGenre(ix: ScanIndex, has: (f: FeatureId) => boolean): GenreVerdict {
  const scores = new Map<Genre, { score: number; why: string[] }>();
  for (const sig of GENRE_SIGNALS) {
    if (!sig.test(ix, has)) continue;
    const cur = scores.get(sig.genre) ?? { score: 0, why: [] };
    cur.score += sig.weight;
    cur.why.push(sig.why);
    scores.set(sig.genre, cur);
  }
  const ranked = [...scores.entries()]
    .map(([genre, v]) => ({ genre, score: v.score, why: v.why }))
    .sort((a, b) => b.score - a.score || a.genre.localeCompare(b.genre));
  const top = ranked[0];
  const second = ranked[1];
  if (!top || top.score < GENRE_FLOOR) {
    return {
      genre: 'unknown',
      confidence: 0,
      evidence: top ? [`only weak signals: ${top.why.join('; ')}`] : ['the project carries no genre signal yet'],
      runnerUp: null,
      scores: ranked.map((r) => ({ genre: r.genre, score: r.score })),
    };
  }
  const margin = top.score - (second?.score ?? 0);

  //[[ A TIE IS NOT A VERDICT, and the sort order must not become the answer.
  //
  //   `ranked` breaks ties with `a.genre.localeCompare(b.genre)`, which is right for determinism
  //   and catastrophic as a decision: on a real place this returned `racing` over `roleplay`
  //   because both scored 3 and R-A sorts before R-O. `buildRoadmap` then produced `race_track`,
  //   `race_vehicles` and `race_results` for a shard-collecting simulator.
  //
  //   The comment below already says a 6-4 win is "a coin toss dressed as a verdict". A 6-6 win
  //   is a coin toss with no dressing at all, and `unknown` is a supported genre with its own
  //   milestone path — so saying "I do not know, and here is what it was between" is both
  //   available and honest. ]]
  if (margin === 0 && second) {
    return {
      genre: 'unknown',
      confidence: 0,
      evidence: [`tied at ${top.score}: ${top.genre} and ${second.genre} are indistinguishable on the evidence`],
      runnerUp: { genre: second.genre, score: second.score },
      scores: ranked.map((r) => ({ genre: r.genre, score: r.score })),
    };
  }

  return {
    genre: top.genre,
    // Confidence is the margin over the winner's own score: a 6-4 win is a coin toss dressed as a
    // verdict, a 6-0 win is not. Never reported as certainty.
    confidence: Math.round(Math.min(1, margin / top.score) * 100) / 100,
    evidence: top.why,
    runnerUp: second ? { genre: second.genre, score: second.score } : null,
    scores: ranked.map((r) => ({ genre: r.genre, score: r.score })),
  };
}

// -----------------------------------------------------------------------------------------------
// The shape of the project: everything a milestone or a brief is allowed to reason from.
// -----------------------------------------------------------------------------------------------

export interface ProjectSystems {
  /** currency value names the scripts actually create, e.g. ["Coins"] */
  currencies: string[];
  /** existing zone/area containers, by real path — this is what makes "Add Zone 2" specific */
  zones: NamedInstance[];
  serverScripts: string[];
  clientScripts: string[];
  moduleScripts: string[];
  guis: string[];
  topLevel: string[];
  spawns: number;
  parts: number;
}

export interface ProjectShape {
  genre: Genre;
  genreLabel: string;
  genreConfidence: number;
  genreEvidence: string[];
  runnerUp: { genre: Genre; score: number } | null;
  features: Record<FeatureId, { state: Detected; evidence: string }>;
  systems: ProjectSystems;
  scale: { instances: number; parts: number; scripts: number; scriptsRead: number };
  /** what the scan could not see. Surfaced verbatim to the user; never silently swallowed. */
  limits: string[];
}

/** Value names created next to a `leaderstats` folder — the project's real currency names. */
function currencyNames(scan: ProjectScan): string[] {
  const out = new Set<string>();
  for (const s of scan.scripts) {
    if (!/leaderstats/i.test(s.source)) continue;
    // Instance.new("IntValue") ... .Name = "Coins"  /  local coins = Instance.new("NumberValue")
    for (const m of s.source.matchAll(/\.Name\s*=\s*["']([A-Za-z][A-Za-z0-9 _]{1,20})["']/g)) {
      const name = m[1]!;
      if (/^leaderstats$/i.test(name)) continue;
      out.add(name);
    }
  }
  return [...out].slice(0, 6);
}

const ZONE_NAME = /^(?:zone|area|world|island|region|map|level|floor|stage)[\s_-]*\d*$/i;

export function analyzeProject(scan: ProjectScan): ProjectShape {
  const ix = buildIndex(scan);
  const features = {} as Record<FeatureId, { state: Detected; evidence: string }>;
  for (const d of DETECTORS) features[d.id] = detect(ix, d);
  const has = (f: FeatureId) => features[f]?.state === 'present';
  const genre = detectGenre(ix, has);

  const zones = scan.named.filter((n) => ZONE_NAME.test(n.name)).slice(0, 12);
  const limits: string[] = [];
  if (scan.truncated.scan) limits.push('the place is large enough that the scan stopped early — some of it was not read');
  if (scan.truncated.scripts) limits.push(`only ${scan.scripts.length} of ${scan.counts.scripts} scripts were read`);
  if (scan.truncated.source) limits.push('some script sources were read only in part');
  if (scan.truncated.named) limits.push('only the first 250 models and folders were named');

  return {
    genre: genre.genre,
    genreLabel: GENRE_LABEL[genre.genre],
    genreConfidence: genre.confidence,
    genreEvidence: genre.evidence,
    runnerUp: genre.runnerUp,
    features,
    systems: {
      currencies: currencyNames(scan),
      zones,
      serverScripts: scan.scripts.filter((s) => s.className === 'Script').map((s) => s.path).slice(0, 12),
      clientScripts: scan.scripts.filter((s) => s.className === 'LocalScript').map((s) => s.path).slice(0, 12),
      moduleScripts: scan.scripts.filter((s) => s.className === 'ModuleScript').map((s) => s.path).slice(0, 12),
      guis: scan.guis.slice(0, 12),
      topLevel: scan.topLevel.slice(0, 20),
      spawns: scan.classes.SpawnLocation ?? 0,
      parts: scan.counts.parts,
    },
    scale: {
      instances: scan.counts.instances,
      parts: scan.counts.parts,
      scripts: scan.counts.scripts,
      scriptsRead: scan.scripts.length,
    },
    limits,
  };
}

// -----------------------------------------------------------------------------------------------
// The catalogue.
//
// Every entry declares the genres it belongs to. `any` means it is a foundation every Roblox
// experience needs (somewhere to spawn, something on screen, progress that survives a rejoin) —
// NOT a fashionable feature. Fashionable features are all genre-scoped, which is the mechanism
// that keeps rebirth away from tower defence.
// -----------------------------------------------------------------------------------------------

export type Complexity = 'small' | 'medium' | 'large';

interface MilestoneSpec {
  id: string;
  title: string;
  /** player-facing rationale: what the PLAYER gets, not what the developer types */
  why: string;
  impact: string;
  complexity: Complexity;
  /** Golem effort, in the units the product actually bills in */
  mode: GolemMode;
  runs: number;
  dependsOn: readonly string[];
  genres: readonly (Genre | 'any')[];
  /** features whose presence means this milestone is already built */
  satisfiedBy: readonly FeatureId[];
  /** ordering weight; foundations first. Ties break on id, so the order is stable. */
  priority: number;
  /** what a builder must actually do. Rendered into the execution brief. */
  build: readonly string[];
  /** how the result is checked — becomes the brief's acceptance list */
  acceptance: readonly string[];
}

const CATALOGUE: readonly MilestoneSpec[] = [
  // ---- foundations, every genre -----------------------------------------------------------
  {
    id: 'playable_spawn',
    title: 'A deliberate spawn and first view',
    why: 'A player who lands facing a grey void decides in three seconds that there is nothing here.',
    impact: 'Every session starts pointed at the thing the game is about.',
    complexity: 'small', mode: 'stone', runs: 1, priority: 10,
    dependsOn: [], genres: ['any'], satisfiedBy: ['spawn'],
    build: [
      'Place a SpawnLocation on solid ground at the entrance to the main play area.',
      'Aim the spawn so the first thing in frame is the landmark the game is about.',
      'Give the spawn area a floor, a boundary and a readable path onward.',
    ],
    acceptance: ['A player spawns on the ground, not in the air.', 'The landmark is visible from the spawn without moving the camera.'],
  },
  {
    id: 'client_server_backbone',
    title: 'A client/server backbone',
    why: 'Anything the player triggers has to be decided by the server, or it is not really happening.',
    impact: 'Actions are consistent for everyone in the server instead of local illusions.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 30,
    dependsOn: ['playable_spawn'], genres: ['any'], satisfiedBy: ['remotes'],
    build: [
      'Create a RemoteEvent folder in ReplicatedStorage for the actions the player can take.',
      'Move the decision for each action into a Script in ServerScriptService.',
      'Leave the LocalScript responsible only for input and feedback.',
      'Name each remote for the ACTION the client is requesting, not the outcome — the client asks to buy, it never announces that it has bought.',
    ],
    acceptance: [
      'A player action is applied by the server and visible to other players.',
      'No remote accepts a result the client has already decided.',
    ],
  },
  {
    id: 'readable_hud',
    title: 'A HUD that shows the state the player cares about',
    why: 'Progress the player cannot see is progress they do not feel.',
    impact: 'The player can tell at a glance what they have and what they are working towards.',
    complexity: 'small', mode: 'stone', runs: 1, priority: 40,
    dependsOn: [], genres: ['any'], satisfiedBy: ['client_ui'],
    build: [
      'Add a ScreenGui in StarterGui with the one or two numbers that drive the loop.',
      'Update it from the server value, never from a local guess.',
    ],
    acceptance: ['The number on screen matches the server value after a rejoin.'],
  },
  {
    id: 'mood_pass',
    title: 'A lighting mood',
    why: 'Default Roblox lighting is the single loudest signal that a place is unfinished.',
    impact: 'The place reads as somewhere, instead of as a build in an editor.',
    complexity: 'small', mode: 'stone', runs: 1, priority: 45,
    dependsOn: [], genres: ['any'], satisfiedBy: ['lighting_mood'],
    build: [
      'Set a time of day, Atmosphere and colour treatment that match what the place is meant to feel like.',
      'Add local lights where the player actually stands.',
    ],
    acceptance: ['Lighting carries an Atmosphere and a deliberate ClockTime, not the defaults.'],
  },
  {
    id: 'audio_pass',
    title: 'Sound where the player is',
    why: 'Silence makes a place feel empty even when it looks full.',
    impact: 'The world sounds inhabited and actions have weight.',
    complexity: 'small', mode: 'clay', runs: 1, priority: 55,
    dependsOn: ['mood_pass'], genres: ['any'], satisfiedBy: ['sound'],
    build: [
      'Add ambient sound to the main area and a short sound to the core action.',
      'Keep volumes low enough to sit under the action.',
    ],
    acceptance: ['The core action makes a sound.', 'Ambience plays in the main area.'],
  },
  {
    id: 'save_progress',
    title: 'Progress that survives leaving',
    why: 'Anything a player earns and then loses on rejoin teaches them not to earn it again.',
    impact: 'Sessions add up, so coming back is worth something.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 60,
    dependsOn: ['economy'], genres: ['any'], satisfiedBy: ['persistence'],
    build: [
      'Write with UpdateAsync, never SetAsync. UpdateAsync is a read-modify-write the service serialises, so two servers saving the same player cannot silently overwrite each other; SetAsync takes the last writer and discards the other.',
      'If the load FAILED, refuse to save for that session. Writing a fresh default over a read that errored is how a player loses everything, and on the server it looks identical to a successful save.',
      'Session-lock the profile on join and release it on leave, so the same player joined twice cannot duplicate what they own.',
      'Wrap every DataStore call in pcall and retry with backoff — the service fails transiently, and an unhandled error is a lost session rather than a visible one.',
      'Save on game:BindToClose as well as on PlayerRemoving. A server shutting down does not always fire PlayerRemoving for everyone before it goes.',
      'Load on join before the player can act, and hold them until it resolves.',
    ],
    acceptance: [
      'A player earns, leaves, rejoins and still has it.',
      'A failed load does not overwrite the save.',
      'The same player joined twice cannot hold two writable copies of the profile.',
      'A shutdown mid-session still persists what was earned.',
    ],
  },
  {
    id: 'server_authority',
    title: 'Server-side validation of every request',
    why: 'One exploiter with unlimited currency ends the economy for everyone in the server.',
    impact: 'What the leaderboard says stays true.',
    complexity: 'medium', mode: 'rune', runs: 1, priority: 70,
    dependsOn: ['client_server_backbone', 'save_progress'], genres: ['any'], satisfiedBy: ['anticheat'],
    build: [
      'Validate every RemoteEvent argument on the server: its type, its range, and whether THIS player is allowed to do it at all. All three — a correctly typed value can still be a request the player has no right to make.',
      'Rate-limit per player per remote on the SERVER, with a token bucket or a last-fired timestamp. A debounce in the LocalScript is not a rate limit; it is a courtesy the exploiter deletes.',
      'Never accept an amount from the client. The client reports that a button was pressed; the server decides what that is worth.',
      'Prefer a RemoteEvent to a RemoteFunction for anything a client initiates. A RemoteFunction invoked by a client yields the server thread waiting for a reply the client controls.',
    ],
    acceptance: [
      'A remote fired with junk arguments changes nothing.',
      'A remote fired in a loop is throttled server-side.',
      'A client that claims it earned a million is ignored, not clamped.',
    ],
  },
  {
    id: 'onboarding',
    title: 'The first minute teaches the loop',
    why: 'Most players who leave never understood what they were supposed to do.',
    impact: 'More of the players who arrive stay long enough to reach the fun.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 80,
    dependsOn: ['readable_hud'], genres: ['any'], satisfiedBy: ['tutorial'],
    build: [
      'Guide the first action with a prompt at the spawn rather than a wall of text.',
      'Mark it finished per player so it never repeats.',
    ],
    acceptance: ['A new player performs the core action without being told anything out of game.'],
  },
  {
    id: 'global_leaderboard',
    title: 'A leaderboard worth chasing',
    why: 'A public number turns a solo grind into a comparison.',
    impact: 'Players come back to defend a position.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 85,
    dependsOn: ['save_progress'], genres: ['any'], satisfiedBy: ['leaderboard_global'],
    build: [
      'Write the tracked stat to an OrderedDataStore on save.',
      'Read the board with GetSortedAsync on a timer — once a minute is plenty — never on player join.',
      'GetSortedAsync is a LIST operation: 5 requests a minute plus 2 per player, against 60 plus 40 for an ordinary read. It is the scarcest budget in the API, so do not spend it on the most repetitive request.',
      'Keep the last page that loaded. A failed fetch should leave the previous board on screen; an empty board reads as "nobody has scored".',
      'Render the top entries on a SurfaceGui somewhere players pass.',
    ],
    acceptance: [
      'The board updates after a session and survives a server restart.',
      'A failed fetch leaves the previous board up rather than blanking it.',
    ],
  },
  {
    id: 'shopfront',
    title: 'Somewhere to spend what is earned',
    why: 'Currency with nothing to buy is a number that stops mattering by the second session.',
    impact: 'Earning has a destination, so the loop closes.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 90,
    dependsOn: ['economy', 'readable_hud'], genres: ['any'], satisfiedBy: ['shop'],
    build: [
      'Build a shop the player walks to, with the purchasable items shown in the world.',
      'Take the purchase decision on the server and deduct there.',
    ],
    acceptance: ['A purchase deducts on the server and cannot be repeated for free.'],
  },
  {
    id: 'daily_return',
    title: 'A reason to come back tomorrow',
    why: 'A returning player is worth more than a new one and costs nothing to reach.',
    impact: 'Day-two returns rise without any new content.',
    complexity: 'small', mode: 'stone', runs: 1, priority: 95,
    dependsOn: ['save_progress'], genres: ['any'], satisfiedBy: ['daily_reward'],
    build: [
      'Award a daily bonus on the first join of a day, tracked in the same save.',
      'Decide what day it is from os.time() on the SERVER. A client clock is a setting the player can change, and a date read from it turns a daily reward into an unlimited one.',
    ],
    acceptance: [
      'The bonus is awarded once per day per player, verified server-side.',
      'Changing the device clock does not award it again.',
    ],
  },
  {
    id: 'monetisation',
    title: 'One honest thing to buy',
    why: 'Players will pay for convenience and cosmetics once the loop is worth being in.',
    impact: 'The game earns without taking anything away from players who do not pay.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 100,
    dependsOn: ['shopfront'], genres: ['any'], satisfiedBy: ['monetization'],
    build: [
      'Add one gamepass or developer product that saves time or looks good, never one that gates the core loop.',
      'For a developer product, implement MarketplaceService.ProcessReceipt and return Enum.ProductPurchaseDecision.PurchaseGranted ONLY after the grant has been written and the write confirmed. Returning it first tells Roblox to stop retrying, and the player has paid for nothing.',
      'Make ProcessReceipt idempotent on receipt.PurchaseId. Roblox may call it more than once for a single purchase, and a handler that just adds the reward grants it twice.',
      'For a gamepass, check ownership once on join with UserOwnsGamePassAsync and cache it for the session. It is a web call and must never sit inside a loop or a per-frame check.',
      'Grant on rejoin too, from the save rather than from a fresh purchase check.',
    ],
    acceptance: [
      'The benefit persists after a rejoin.',
      'A non-paying player can still finish the core loop.',
      'ProcessReceipt called twice for one PurchaseId grants once.',
      'A grant that fails to save is not reported as PurchaseGranted.',
    ],
  },

  // ---- the economy foundation, only where an economy belongs ------------------------------
  {
    id: 'economy',
    title: 'A currency the loop runs on',
    why: 'The player needs one number that goes up when they do the thing the game is about.',
    impact: 'Every action gets a visible consequence.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 20,
    dependsOn: ['client_server_backbone'],
    genres: ['simulator', 'tycoon', 'tower_defence', 'adventure', 'roleplay', 'combat'],
    satisfiedBy: ['currency'],
    build: [
      'Create a leaderstats folder per player with the single currency the loop uses.',
      'Award it from the server on the core action.',
      'Keep the authoritative balance in the save and treat leaderstats as a display mirror of it. leaderstats is replicated state built for showing a number, and anything that writes to it directly will drift from what the player actually owns.',
    ],
    acceptance: [
      'The currency rises only from a server-side award.',
      'The saved balance is the number the game spends, not the leaderstats value.',
    ],
  },

  // ---- obby --------------------------------------------------------------------------------
  {
    id: 'obby_stages',
    title: 'Stages with checkpoints',
    why: 'Without checkpoints, one mistake sends the player back to the start and they quit instead.',
    impact: 'Players push further because losing costs a stage, not the run.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 22,
    dependsOn: ['playable_spawn'], genres: ['obby'], satisfiedBy: ['checkpoints'],
    build: [
      'Split the course into numbered stages, each ending in a checkpoint SpawnLocation.',
      'Store the reached stage per player so respawn returns them to it.',
    ],
    acceptance: ['Dying returns the player to their last checkpoint, not to stage 1.'],
  },
  {
    id: 'obby_hazards',
    title: 'Hazards with a readable tell',
    why: 'A hazard the player could not have seen coming reads as the game cheating.',
    impact: 'Deaths feel earned, so players try again instead of leaving.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 26,
    dependsOn: ['obby_stages'], genres: ['obby'], satisfiedBy: ['killbricks'],
    build: [
      'Give every killing surface an unmistakable colour and material.',
      'Vary the hazard type per stage: timing, gap, moving platform.',
    ],
    acceptance: ['Every killing part is visually distinct from safe geometry.'],
  },
  {
    id: 'obby_difficulty_curve',
    title: 'A difficulty curve across the stages',
    why: 'Stage 2 being harder than stage 7 makes the course feel random rather than designed.',
    impact: 'Players feel themselves getting better.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 36,
    dependsOn: ['obby_hazards'], genres: ['obby'], satisfiedBy: [],
    build: [
      'Order the stages so each one adds exactly one new demand.',
      'Widen early gaps and tighten late ones.',
    ],
    acceptance: ['Each stage introduces one new mechanic or one increment of the previous one.'],
  },

  // ---- tycoon ------------------------------------------------------------------------------
  {
    id: 'tycoon_plot',
    title: 'A plot the player owns',
    why: 'A tycoon is only satisfying when the thing being built is unmistakably yours.',
    impact: 'Two players in a server never fight over the same base.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 22,
    dependsOn: ['playable_spawn'], genres: ['tycoon'], satisfiedBy: ['plots'],
    build: [
      'Lay out identical plots and assign one to each joining player on the server.',
      'Release the plot when they leave.',
    ],
    acceptance: ['Two players in one server get different plots.', 'A left plot is reusable.'],
  },
  {
    id: 'tycoon_income',
    title: 'An income chain that runs while you watch',
    why: 'Watching money arrive on its own is the whole appeal of the genre.',
    impact: 'Idle time still produces progress, so players stay in the server.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 28,
    dependsOn: ['tycoon_plot', 'economy'], genres: ['tycoon'], satisfiedBy: ['dropper'],
    build: [
      'Build the dropper, conveyor and collector chain on the plot.',
      'Credit the owner on the server when a dropped part reaches the collector.',
    ],
    acceptance: ['Standing still increases the owner currency.', 'Another player cannot collect from your plot.'],
  },
  {
    id: 'tycoon_buy_buttons',
    title: 'Buy buttons that expand the base',
    why: 'The base growing in front of the player is the reward, not the number.',
    impact: 'Each purchase visibly changes the world.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 34,
    dependsOn: ['tycoon_income'], genres: ['tycoon'], satisfiedBy: ['upgrades'],
    build: [
      'Add buy buttons that unlock the next piece of the plot in sequence.',
      'Persist which buttons a player has bought.',
    ],
    acceptance: ['A bought upgrade is still there after a rejoin.'],
  },

  // ---- simulator ---------------------------------------------------------------------------
  {
    id: 'sim_core_action',
    title: 'One action worth repeating',
    why: 'A simulator lives or dies on whether the first ten seconds of the core action feel good.',
    impact: 'The loop is fun before any content is added on top.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 22,
    dependsOn: ['economy'], genres: ['simulator'], satisfiedBy: [],
    build: [
      'Make the core action a single input with immediate feedback: sound, a number popping, an animation.',
      'Tune the award so the first upgrade is reachable in about a minute.',
    ],
    acceptance: ['The action gives visible and audible feedback every time.'],
  },
  {
    id: 'sim_upgrades',
    title: 'Upgrades that change the pace',
    why: 'The player needs to feel the loop speed up, not just see a bigger number.',
    impact: 'Each purchase is felt in the next ten seconds of play.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 30,
    dependsOn: ['sim_core_action', 'shopfront'], genres: ['simulator'], satisfiedBy: ['upgrades'],
    build: ['Add tiers that multiply the award or the capacity, priced on a curve that keeps buying frequent early.'],
    acceptance: ['An upgrade measurably changes the rate of the core action.'],
  },
  {
    id: 'sim_zones',
    title: 'A second zone to unlock',
    why: 'A new place to stand is the cheapest progression a player can feel.',
    impact: 'Players have somewhere to be going, not just a number to raise.',
    complexity: 'medium', mode: 'stone', runs: 2, priority: 38,
    dependsOn: ['sim_upgrades'], genres: ['simulator'], satisfiedBy: ['zones'],
    build: [
      'Gate the next zone behind a currency threshold with a visible barrier.',
      'Raise both the reward and the cost inside it so the previous zone is retired.',
    ],
    acceptance: ['The gate refuses entry below the threshold, checked on the server.'],
  },
  {
    id: 'sim_pets',
    title: 'Pets that multiply the loop',
    why: 'A collection the player can show off carries a simulator far longer than the numbers do.',
    impact: 'Players chase rarity as well as totals.',
    complexity: 'large', mode: 'rune', runs: 2, priority: 44,
    dependsOn: ['sim_zones', 'save_progress'], genres: ['simulator'], satisfiedBy: ['pets'],
    build: [
      'Add eggs with a server-side rarity roll and a pet that follows the player.',
      'Apply the pet multiplier on the server and persist the inventory.',
    ],
    acceptance: ['Rarity is rolled server-side.', 'Pets survive a rejoin.'],
  },
  {
    id: 'rebirth_loop',
    title: 'Rebirth: trade everything for a permanent multiplier',
    why: 'It gives players who have finished the content a reason to do it all again faster.',
    impact: 'The end of the content stops being the end of the game.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 50,
    dependsOn: ['sim_zones', 'save_progress'],
    // Deliberately simulator and tycoon ONLY. This is the milestone §31 names: it is a genre
    // convention, not a universal feature, and offering it to a tower-defence or obby project is
    // exactly the generic advice the roadmap exists to avoid.
    genres: ['simulator', 'tycoon'], satisfiedBy: ['rebirth'],
    build: [
      'Reset the currency and upgrades, award a permanent multiplier, persist the rebirth count.',
      'Show the count somewhere public so it is worth having.',
    ],
    acceptance: ['A rebirth resets progress and permanently raises the rate.', 'The count survives a rejoin.'],
  },

  // ---- tower defence -----------------------------------------------------------------------
  {
    id: 'td_path',
    title: 'A path enemies actually walk',
    why: 'The player has to be able to read where the danger will come from before they spend anything.',
    impact: 'Placement becomes a decision rather than a guess.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 22,
    dependsOn: ['playable_spawn'], genres: ['tower_defence'], satisfiedBy: ['path_waypoints'],
    build: [
      'Lay a waypoint folder from the spawn to the base and make the route legible in the geometry.',
      'Move enemies along the waypoints on the server.',
    ],
    acceptance: ['Enemies follow the visible route from spawn to base.'],
  },
  {
    id: 'td_waves',
    title: 'Waves that arrive on a rhythm',
    why: 'The gap between waves is when the player gets to make decisions — without it there is no game.',
    impact: 'Tension rises and releases instead of running flat.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 28,
    dependsOn: ['td_path', 'economy'], genres: ['tower_defence'], satisfiedBy: ['waves'],
    build: [
      'Drive waves from a server table: count, type and delay per wave.',
      'Award currency at the end of each wave and show the wave number on the HUD.',
    ],
    acceptance: ['Waves run in order with a readable break between them.'],
  },
  {
    id: 'td_towers',
    title: 'Towers the player places and pays for',
    why: 'Choosing what to build and where is the entire decision the genre is made of.',
    impact: 'Two players make different boards out of the same map.',
    complexity: 'large', mode: 'rune', runs: 2, priority: 34,
    dependsOn: ['td_waves'], genres: ['tower_defence'], satisfiedBy: ['towers'],
    build: [
      'Add a placement mode with a valid/invalid preview and a server-side placement check.',
      'Give each tower distinct range, rate and damage so the choice matters.',
    ],
    acceptance: ['Placement is validated on the server.', 'Two tower types are meaningfully different.'],
  },
  {
    id: 'td_tower_upgrades',
    title: 'Upgrade paths for placed towers',
    why: 'Deciding whether to place another tower or improve this one is the mid-game decision.',
    impact: 'Later waves are beaten by planning, not by spam.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 40,
    dependsOn: ['td_towers'], genres: ['tower_defence'], satisfiedBy: ['upgrades'],
    build: ['Add per-tower upgrade tiers with a visible model change and a server-side cost check.'],
    acceptance: ['An upgraded tower looks different and performs differently.'],
  },
  {
    id: 'td_difficulty_scaling',
    title: 'Difficulty that scales past the first ten waves',
    why: 'A run that becomes unloseable is as boring as one that is impossible.',
    impact: 'The session has an ending worth reaching.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 46,
    dependsOn: ['td_tower_upgrades'], genres: ['tower_defence'], satisfiedBy: [],
    build: [
      'Scale enemy health and count per wave, and introduce one new enemy behaviour every few waves.',
      'Give the run an end condition and a result screen.',
    ],
    acceptance: ['Wave 15 is meaningfully harder than wave 5.', 'The run ends and reports a result.'],
  },
  {
    id: 'td_second_map',
    title: 'A second map with a different shape',
    why: 'One layout is solved after three runs; a second route makes the towers interesting again.',
    impact: 'Replay value without any new systems.',
    complexity: 'medium', mode: 'stone', runs: 2, priority: 52,
    dependsOn: ['td_difficulty_scaling'], genres: ['tower_defence'], satisfiedBy: ['zones'],
    build: [
      'Build a second map with a different path length and number of junctions.',
      'Select the map at round start and reuse the same wave and tower systems.',
    ],
    acceptance: ['Both maps run through the same wave system.'],
  },

  // ---- combat ------------------------------------------------------------------------------
  {
    id: 'combat_weapons',
    title: 'Weapons that feel different from each other',
    why: 'If two weapons play the same, the choice between them is not a choice.',
    impact: 'Players find a favourite and come back for it.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 22,
    dependsOn: ['client_server_backbone'], genres: ['combat'], satisfiedBy: ['weapons'],
    build: [
      'Give each weapon distinct range, rate and damage, applied on the server.',
      'Add hit feedback the attacker can see.',
    ],
    acceptance: ['Damage is applied server-side.', 'Two weapons differ in more than their model.'],
  },
  {
    id: 'combat_rounds',
    title: 'Rounds with a lobby and a result',
    why: 'Endless free-for-all has no stakes; a round has a beginning, a middle and a winner.',
    impact: 'Players stay for one more round.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 30,
    dependsOn: ['combat_weapons'], genres: ['combat'], satisfiedBy: ['round_system'],
    build: ['Run an intermission, a match timer and a result announcement on the server.'],
    acceptance: ['A round starts, ends and reports a winner without manual intervention.'],
  },
  {
    id: 'combat_teams',
    title: 'Teams and spawn protection',
    why: 'Being killed at the spawn point is the fastest way to lose a player for good.',
    impact: 'Fights happen where they were designed to happen.',
    complexity: 'small', mode: 'stone', runs: 1, priority: 36,
    dependsOn: ['combat_rounds'], genres: ['combat'], satisfiedBy: ['teams'],
    build: ['Add teams with their own spawn areas and a brief post-spawn invulnerability.'],
    acceptance: ['A freshly spawned player cannot be killed instantly.'],
  },

  // ---- racing ------------------------------------------------------------------------------
  {
    id: 'race_track',
    title: 'A track with checkpoints and a finish',
    why: 'A race without checkpoints is a race that can be cut.',
    impact: 'Results are trustworthy, so competing is worth it.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 22,
    dependsOn: ['playable_spawn'], genres: ['racing'], satisfiedBy: ['racing_track'],
    build: ['Lay out the circuit with ordered checkpoints and validate lap completion on the server.'],
    acceptance: ['Skipping a checkpoint does not complete a lap.'],
  },
  {
    id: 'race_vehicles',
    title: 'A vehicle that is fun to steer',
    why: 'Handling is the whole game; a car that fights the player ends the session.',
    impact: 'Players race again to beat their own time.',
    complexity: 'large', mode: 'rune', runs: 2, priority: 30,
    dependsOn: ['race_track'], genres: ['racing'], satisfiedBy: ['vehicles'],
    build: ['Tune the vehicle for grip, acceleration and recovery after a mistake, and respawn it on demand.'],
    acceptance: ['A player who spins out can recover without rejoining.'],
  },
  {
    id: 'race_results',
    title: 'Times, positions and a result screen',
    why: 'A race with no recorded time is a lap.',
    impact: 'Players chase a personal best.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 38,
    dependsOn: ['race_vehicles'], genres: ['racing'], satisfiedBy: [],
    build: ['Time each lap on the server, show position live, and end the race with a standings screen.'],
    acceptance: ['Lap times are recorded server-side and shown at the end.'],
  },

  // ---- horror ------------------------------------------------------------------------------
  {
    id: 'horror_atmosphere',
    title: 'Darkness the player has to work with',
    why: 'Horror is what the player cannot see; full brightness removes the game.',
    impact: 'Tension exists before anything has happened.',
    complexity: 'small', mode: 'stone', runs: 1, priority: 22,
    dependsOn: [], genres: ['horror'], satisfiedBy: ['lighting_mood'],
    build: ['Drop ambient light, add fog and give the player one weak light source they must aim.'],
    acceptance: ['The player cannot see the whole room at once.'],
  },
  {
    id: 'horror_threat',
    title: 'A threat that hunts',
    why: 'A monster that stands still is scenery.',
    impact: 'The player is being chased, not visiting.',
    complexity: 'large', mode: 'rune', runs: 2, priority: 30,
    dependsOn: ['horror_atmosphere'], genres: ['horror'], satisfiedBy: ['enemies'],
    build: ['Give the threat a patrol, a detection range and a chase, all decided on the server.'],
    acceptance: ['The threat changes behaviour when it detects a player.'],
  },
  {
    id: 'horror_objective',
    title: 'Something to do while being hunted',
    why: 'Running with no goal becomes tedious in about ninety seconds.',
    impact: 'Fear has a purpose and the session has an end.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 38,
    dependsOn: ['horror_threat'], genres: ['horror'], satisfiedBy: ['quests'],
    build: ['Scatter objectives that must be collected or completed to escape, tracked on the server.'],
    acceptance: ['Completing the objectives ends the round.'],
  },

  // ---- roleplay ----------------------------------------------------------------------------
  {
    id: 'rp_roles',
    title: 'Roles players can pick',
    why: 'Roleplay needs a reason for two players to behave differently.',
    impact: 'Players have something to be, not just somewhere to stand.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 22,
    dependsOn: ['client_server_backbone'], genres: ['roleplay'], satisfiedBy: ['teams'],
    build: ['Add teams for the roles with a picker, and give each role one thing only it can do.'],
    acceptance: ['A role grants an ability the others do not have.'],
  },
  {
    id: 'rp_spaces',
    title: 'Rooms built for the things players do',
    why: 'People roleplay where the furniture suggests a scene.',
    impact: 'Groups gather instead of scattering.',
    complexity: 'medium', mode: 'stone', runs: 2, priority: 30,
    dependsOn: ['rp_roles'], genres: ['roleplay'], satisfiedBy: [],
    build: ['Build the two or three spaces the roles need, with seating, props and clear entrances.'],
    acceptance: ['Each space seats a group and is reachable without climbing.'],
  },
  {
    id: 'rp_customisation',
    title: 'Something the player can make theirs',
    why: 'Identity is the currency of a roleplay game.',
    impact: 'Players return to a character rather than to a place.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 40,
    dependsOn: ['rp_spaces', 'save_progress'], genres: ['roleplay'], satisfiedBy: ['customization'],
    build: ['Add outfits or accessories chosen in a menu, applied on the server and saved.'],
    acceptance: ['The choice survives a rejoin.'],
  },

  // ---- adventure ---------------------------------------------------------------------------
  {
    id: 'adv_quests',
    title: 'A first quest chain',
    why: 'An open world with nothing asked of the player is a walking simulator.',
    impact: 'Players have a thread to follow through the world.',
    complexity: 'large', mode: 'rune', runs: 2, priority: 22,
    dependsOn: ['economy'], genres: ['adventure'], satisfiedBy: ['quests'],
    build: ['Add a quest with a giver, a tracked objective and a reward, with state kept per player.'],
    acceptance: ['Quest state is server-side and survives a rejoin.'],
  },
  {
    id: 'adv_npcs',
    title: 'NPCs worth walking up to',
    why: 'The world needs to answer when a player interacts with it.',
    impact: 'The place feels populated rather than staged.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 30,
    dependsOn: ['adv_quests'], genres: ['adventure'], satisfiedBy: ['dialogue'],
    build: ['Give the quest giver and one or two others a ProximityPrompt and short branching dialogue.'],
    acceptance: ['Talking to an NPC advances or explains a quest.'],
  },
  {
    id: 'adv_zones',
    title: 'A second region gated behind the first',
    why: 'Progress in an adventure game is measured in places reached.',
    impact: 'Players can see where they are going before they can get there.',
    complexity: 'medium', mode: 'stone', runs: 2, priority: 40,
    dependsOn: ['adv_npcs'], genres: ['adventure'], satisfiedBy: ['zones'],
    build: ['Build the next region with its own look and threat level, gated on quest progress.'],
    acceptance: ['The gate checks quest state on the server.'],
  },

  // ---- showcase ----------------------------------------------------------------------------
  {
    id: 'showcase_route',
    title: 'A route through the build',
    why: 'A visitor who does not know where to walk sees a third of what was made.',
    impact: 'Every visitor sees the parts worth seeing.',
    complexity: 'small', mode: 'stone', runs: 1, priority: 22,
    dependsOn: ['playable_spawn'], genres: ['showcase'], satisfiedBy: [],
    build: ['Lay a walkable route from the spawn past each set piece, with sightlines that reveal the next one.'],
    acceptance: ['A player walking forward from the spawn passes every set piece.'],
  },
  {
    id: 'showcase_interaction',
    title: 'Things that respond to being touched',
    why: 'A build the player cannot affect is a photograph.',
    impact: 'Visitors stay long enough to look properly.',
    complexity: 'medium', mode: 'stone', runs: 1, priority: 30,
    dependsOn: ['showcase_route'], genres: ['showcase'], satisfiedBy: ['dialogue'],
    build: ['Add ProximityPrompts on the details: doors that open, lights that switch, notes that read.'],
    acceptance: ['At least three details respond to interaction.'],
  },
];

// -----------------------------------------------------------------------------------------------
// Assembly.
// -----------------------------------------------------------------------------------------------

/**
 * Which part of the experience a milestone belongs to.
 *
 * Not decoration: it is what lets a client group a roadmap into readable sections without
 * inventing a grouping of its own, and it is fixed per milestone rather than inferred, so two
 * clients never disagree about where something belongs.
 */
export type MilestoneCategory = 'core' | 'world' | 'systems' | 'progression' | 'economy' | 'polish';

const MILESTONE_CATEGORY: Record<string, MilestoneCategory> = {
  playable_spawn: 'core', client_server_backbone: 'systems', readable_hud: 'core', mood_pass: 'polish',
  audio_pass: 'polish', save_progress: 'systems', server_authority: 'systems', onboarding: 'core',
  global_leaderboard: 'progression', shopfront: 'economy', daily_return: 'progression', monetisation: 'economy',
  economy: 'economy',
  obby_stages: 'core', obby_hazards: 'world', obby_difficulty_curve: 'progression',
  tycoon_plot: 'core', tycoon_income: 'economy', tycoon_buy_buttons: 'progression',
  sim_core_action: 'core', sim_upgrades: 'progression', sim_zones: 'world', sim_pets: 'progression',
  rebirth_loop: 'progression',
  td_path: 'world', td_waves: 'core', td_towers: 'core', td_tower_upgrades: 'progression',
  td_difficulty_scaling: 'progression', td_second_map: 'world',
  combat_weapons: 'core', combat_rounds: 'systems', combat_teams: 'systems',
  race_track: 'world', race_vehicles: 'core', race_results: 'systems',
  horror_atmosphere: 'polish', horror_threat: 'core', horror_objective: 'progression',
  rp_roles: 'core', rp_spaces: 'world', rp_customisation: 'progression',
  adv_quests: 'core', adv_npcs: 'world', adv_zones: 'world',
  showcase_route: 'world', showcase_interaction: 'core',
};

export type MilestoneStatus = 'done' | 'current' | 'future' | 'blocked';

export interface Milestone {
  id: string;
  title: string;
  why: string;
  impact: string;
  status: MilestoneStatus;
  dependsOn: string[];
  /** dependencies that are not done yet — the reason a blocked milestone is blocked */
  blockedBy: string[];
  complexity: Complexity;
  effort: string;
  mode: GolemMode;
  category: MilestoneCategory;
  /** the concrete things that exist once it lands — the same list the execution brief builds from */
  deliverables: string[];
  detected: Detected;
  /** what the scan saw that produced `detected` */
  evidence: string[];
  /** set when detection was inconclusive — never presented as a confident recommendation */
  verify: string | null;
}

export interface Roadmap {
  genre: Genre;
  genreLabel: string;
  genreConfidence: number;
  genreEvidence: string[];
  milestones: Milestone[];
  /** §32: a SMALL number of contextual next steps */
  next: Milestone[];
  /** honesty notes: scan limits, low genre confidence */
  notes: string[];
  /** true only when a model successfully reordered or rephrased; never required */
  polished: boolean;
  generatedAt: string;
}

/** §32 keeps this small on purpose: a list of twelve "next steps" is not a recommendation. */
export const MAX_SUGGESTIONS = 3;

/**
 * The effort line is USER-VISIBLE, so it names the PRODUCT mode, not the internal
 * specialist. clay/stone/rune are engine-side identities that §1 keeps off
 * non-admin surfaces and that @golem/shared is explicit are not user-facing
 * brands — "about two Stone runs" leaks one into a milestone card.
 *
 * Mapped here rather than in the client because the string is composed here: a
 * client-side scrub can only repair what the worker already got wrong.
 */
function effortLine(spec: MilestoneSpec): string {
  const mode = spec.mode === 'clay' ? 'Plan' : spec.mode === 'stone' ? 'Agent' : 'Super Agent';
  return spec.runs === 1 ? `about one ${mode} run` : `about ${spec.runs} ${mode} runs`;
}

function specsForGenre(genre: Genre): MilestoneSpec[] {
  return CATALOGUE.filter((s) => s.genres.includes('any') || s.genres.includes(genre));
}

/**
 * Order milestones so a dependency always precedes what depends on it.
 *
 * Kahn's algorithm with a priority tiebreak, so the order is deterministic run to run. Anything
 * left over after the queue empties (only possible from a cycle introduced by a future edit) is
 * appended in priority order rather than dropped: a roadmap missing a milestone is a worse failure
 * than one in an imperfect order.
 */
function topoOrder(specs: MilestoneSpec[]): MilestoneSpec[] {
  const ids = new Set(specs.map((s) => s.id));
  const deps = new Map(specs.map((s) => [s.id, s.dependsOn.filter((d) => ids.has(d))]));
  const byId = new Map(specs.map((s) => [s.id, s]));
  const done = new Set<string>();
  const out: MilestoneSpec[] = [];
  while (out.length < specs.length) {
    const ready = specs
      .filter((s) => !done.has(s.id) && deps.get(s.id)!.every((d) => done.has(d)))
      .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    if (!ready.length) break;
    for (const s of ready) {
      done.add(s.id);
      out.push(s);
    }
  }
  if (out.length < specs.length) {
    for (const s of specs.filter((s) => !done.has(s.id)).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
      out.push(byId.get(s.id)!);
    }
  }
  return out;
}

/** Detection for one milestone: present if every satisfying feature is present. */
function detectionFor(spec: MilestoneSpec, shape: ProjectShape): { state: Detected; evidence: string[] } {
  if (!spec.satisfiedBy.length) {
    return { state: 'unknown', evidence: ['Apple cannot tell from the project files whether this is done'] };
  }
  const states = spec.satisfiedBy.map((f) => shape.features[f]);
  const evidence = spec.satisfiedBy.map((f) => `${f}: ${shape.features[f]?.evidence ?? 'not checked'}`);
  if (states.every((s) => s?.state === 'present')) return { state: 'present', evidence };
  if (states.some((s) => s?.state === 'unknown')) return { state: 'unknown', evidence };
  return { state: 'absent', evidence };
}

export function buildRoadmap(shape: ProjectShape, now = Date.now()): Roadmap {
  const specs = topoOrder(specsForGenre(shape.genre));
  const selected = new Set(specs.map((s) => s.id));

  const detection = new Map(specs.map((s) => [s.id, detectionFor(s, shape)]));
  const doneIds = new Set(specs.filter((s) => detection.get(s.id)!.state === 'present').map((s) => s.id));

  const milestones: Milestone[] = specs.map((s) => {
    const det = detection.get(s.id)!;
    const dependsOn = s.dependsOn.filter((d) => selected.has(d));
    const blockedBy = dependsOn.filter((d) => !doneIds.has(d));
    const status: MilestoneStatus = det.state === 'present' ? 'done' : blockedBy.length ? 'blocked' : 'future';
    return {
      id: s.id,
      title: s.title,
      why: s.why,
      impact: s.impact,
      status,
      dependsOn,
      blockedBy,
      complexity: s.complexity,
      effort: effortLine(s),
      mode: s.mode,
      category: MILESTONE_CATEGORY[s.id] ?? 'core',
      deliverables: [...s.build],
      detected: det.state,
      evidence: det.evidence,
      verify: det.state === 'unknown' ? 'Apple could not confirm this from the project — check before building it again.' : null,
    };
  });

  // The MILESTONE LIST is in dependency order, because that is what a roadmap is. The SUGGESTIONS
  // are ranked by priority instead: every candidate here already has its dependencies met, so
  // dependency order tells the user nothing, and it systematically buries the genre-specific work
  // (which necessarily sits deeper in the graph) under universal polish that happens to have no
  // dependencies. A tower-defence project should be told about tower upgrades before it is told
  // about lighting.
  const priority = new Map(specs.map((sp) => [sp.id, sp.priority]));
  const ready = milestones
    .filter((m) => m.status === 'future')
    .sort((a, b) => (priority.get(a.id) ?? 0) - (priority.get(b.id) ?? 0) || a.id.localeCompare(b.id));
  const current = ready.find((m) => m.detected === 'absent') ?? null;
  if (current) current.status = 'current';

  const next = [current, ...ready.filter((m) => m !== current)].filter((m): m is Milestone => !!m).slice(0, MAX_SUGGESTIONS);

  const notes = [...shape.limits];
  if (shape.genre === 'unknown') {
    notes.push('The project has not said what kind of game it is yet, so only the foundations every experience needs are listed.');
  } else if (shape.genreConfidence < 0.34 && shape.runnerUp) {
    notes.push(`This reads as a ${GENRE_LABEL[shape.genre]}, but ${GENRE_LABEL[shape.runnerUp.genre]} is close behind — say which and the roadmap sharpens.`);
  }
  if (!current && ready.length) notes.push('Everything Apple can detect is already built; what is left could not be verified from the files.');

  return {
    genre: shape.genre,
    genreLabel: shape.genreLabel,
    genreConfidence: shape.genreConfidence,
    genreEvidence: shape.genreEvidence,
    milestones,
    next,
    notes,
    polished: false,
    generatedAt: new Date(now).toISOString(),
  };
}

// -----------------------------------------------------------------------------------------------
// §33 — a milestone handed to Plan or Agent as a real build request.
//
// The whole point is the CONTEXT block: "Add Zone 2" is worthless to a builder that does not know
// what Zone 1 is, so the brief names the actual paths, the actual currency and the actual scripts
// the scan found. A brief for a project with no zones says so, instead of referring to a Zone 1
// that does not exist.
// -----------------------------------------------------------------------------------------------

export interface MilestoneBrief {
  milestoneId: string;
  title: string;
  /** hand this to the agent verbatim */
  request: string;
  mode: GolemMode;
  context: string[];
  steps: string[];
  acceptance: string[];
  /** existing paths the work should build on rather than replace */
  touches: string[];
  ready: boolean;
  blockedBy: string[];
}

function contextLines(spec: MilestoneSpec, shape: ProjectShape): { context: string[]; touches: string[] } {
  const s = shape.systems;
  const context: string[] = [];
  const touches: string[] = [];
  context.push(
    `This project reads as a ${shape.genreLabel} (${shape.genreEvidence.join('; ') || 'no strong signal'}).`,
    `It currently holds ${s.parts} parts and ${shape.scale.scripts} scripts across ${shape.scale.instances} instances.`,
  );
  if (s.topLevel.length) context.push(`Workspace top level: ${s.topLevel.join(', ')}.`);
  if (s.currencies.length) {
    context.push(`The existing currency is ${s.currencies.join(' and ')} — use it, do not introduce another.`);
  } else if (spec.satisfiedBy.includes('currency') || spec.dependsOn.includes('economy')) {
    context.push('No currency exists yet, so this work introduces the first one.');
  }
  if (s.zones.length) {
    context.push(`Existing zones: ${s.zones.map((z) => `${z.name} (${z.path})`).join(', ')}.`);
    touches.push(...s.zones.map((z) => z.path));
  } else if (spec.satisfiedBy.includes('zones')) {
    context.push('There is no named zone yet — the current play area is the first one, so name it as well as building the next.');
  }
  if (s.serverScripts.length) {
    context.push(`Server scripts already in place: ${s.serverScripts.slice(0, 6).join(', ')}. Extend these rather than adding a parallel system.`);
    touches.push(...s.serverScripts.slice(0, 6));
  }
  if (s.guis.length) context.push(`StarterGui already contains: ${s.guis.join(', ')}.`);
  if (s.spawns) context.push(s.spawns === 1 ? 'One SpawnLocation already exists.' : `${s.spawns} SpawnLocations already exist.`);
  if (shape.limits.length) context.push(`Scan limits: ${shape.limits.join('; ')}.`);
  return { context, touches: [...new Set(touches)].slice(0, 12) };
}

export function executionBrief(shape: ProjectShape, roadmap: Roadmap, milestoneId: string): MilestoneBrief | null {
  const spec = CATALOGUE.find((s) => s.id === milestoneId);
  const milestone = roadmap.milestones.find((m) => m.id === milestoneId);
  if (!spec || !milestone) return null;
  const { context, touches } = contextLines(spec, shape);
  const steps = [...spec.build];
  const request = [
    `${spec.title}.`,
    spec.why,
    '',
    'What this project already is:',
    ...context.map((l) => `- ${l}`),
    '',
    'Build this:',
    ...steps.map((l) => `- ${l}`),
    '',
    'It is finished when:',
    ...spec.acceptance.map((l) => `- ${l}`),
  ].join('\n');
  return {
    milestoneId,
    title: spec.title,
    request,
    mode: spec.mode,
    context,
    steps,
    acceptance: [...spec.acceptance],
    touches,
    ready: milestone.status !== 'blocked',
    blockedBy: milestone.blockedBy,
  };
}

// -----------------------------------------------------------------------------------------------
// The optional model pass. Ranking and phrasing ONLY (§39).
//
// The contract is enforced on the way back in, not asked for politely on the way out: unknown ids
// are dropped, missing ids are appended in their deterministic order, statuses are untouched, and
// a rewritten `why` is capped and stripped of newlines. A model that returns nothing usable leaves
// the roadmap exactly as the deterministic pass built it, with `polished` still false — the caller
// is told what happened rather than being handed a silently degraded result.
// -----------------------------------------------------------------------------------------------

export type RoadmapChat = (req: { system: string; user: string }) => Promise<string>;

export const POLISH_SYSTEM =
  'You rank and phrase milestones for a Roblox game roadmap. You may reorder the milestones you are given and rewrite each one-line reason. ' +
  'You may not invent milestones, remove them, or claim anything about what the project already contains. ' +
  'Reply with JSON only: {"order":["id",...],"why":{"id":"one short sentence"}}.';

const MAX_WHY = 180;

export async function polishRoadmap(roadmap: Roadmap, shape: ProjectShape, chat: RoadmapChat): Promise<Roadmap> {
  if (!roadmap.next.length) return roadmap;
  const user = [
    `Game type: ${shape.genreLabel}. Evidence: ${shape.genreEvidence.join('; ') || 'none'}.`,
    `Scale: ${shape.scale.parts} parts, ${shape.scale.scripts} scripts.`,
    'Candidate next milestones:',
    ...roadmap.next.map((m) => `- ${m.id}: ${m.title} — ${m.why}`),
    'Order them by what would help this specific game most, and rewrite each reason for this game in one sentence.',
  ].join('\n');

  let raw: string;
  try {
    raw = await chat({ system: POLISH_SYSTEM, user });
  } catch {
    return roadmap; // a failed phrasing pass is not a failed roadmap
  }
  const parsed = parsePolish(raw);
  if (!parsed) return roadmap;

  const byId = new Map(roadmap.next.map((m) => [m.id, m]));
  const ordered: Milestone[] = [];
  for (const id of parsed.order) {
    const m = byId.get(id);
    if (m && !ordered.includes(m)) ordered.push(m);
  }
  for (const m of roadmap.next) if (!ordered.includes(m)) ordered.push(m);

  const rewrite = (m: Milestone): Milestone => {
    const why = parsed.why[m.id];
    if (!why) return m;
    return { ...m, why: why.replace(/\s+/g, ' ').trim().slice(0, MAX_WHY) };
  };
  const next = ordered.map(rewrite);
  const rewritten = new Map(next.map((m) => [m.id, m]));
  return {
    ...roadmap,
    next,
    milestones: roadmap.milestones.map((m) => rewritten.get(m.id) ?? m),
    polished: true,
  };
}

/** Pull the JSON object out of whatever the model wrapped it in. Returns null on anything else. */
export function parsePolish(raw: string): { order: string[]; why: Record<string, string> } | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const order = Array.isArray(o.order) ? o.order.filter((x): x is string => typeof x === 'string') : [];
  const why: Record<string, string> = {};
  if (o.why && typeof o.why === 'object') {
    for (const [k, v] of Object.entries(o.why)) if (typeof v === 'string' && v.trim()) why[k] = v;
  }
  if (!order.length && !Object.keys(why).length) return null;
  return { order, why };
}

/**
 * The shape as the client sees it.
 *
 * Whitelisted field by field, the way /api/admin/model-routing whitelists its rows: the point is
 * that a future field on ProjectShape has to be looked at before it can egress. `features` is
 * flattened to id -> state because the UI's honest question is "does the project have this", and
 * the evidence string is the answer to a different one.
 */
export function publicShape(shape: ProjectShape): {
  genre: Genre;
  genreLabel: string;
  genreConfidence: number;
  genreEvidence: string[];
  features: Record<string, Detected>;
  systems: ProjectSystems;
  scale: ProjectShape['scale'];
  limits: string[];
} {
  const features: Record<string, Detected> = {};
  for (const [id, v] of Object.entries(shape.features)) features[id] = v.state;
  return {
    genre: shape.genre,
    genreLabel: shape.genreLabel,
    genreConfidence: shape.genreConfidence,
    genreEvidence: shape.genreEvidence,
    features,
    systems: shape.systems,
    scale: shape.scale,
    limits: shape.limits,
  };
}

/** One call: scan a live project and produce its roadmap. The model pass is the caller's choice. */
export async function roadmapForProject(probe: StudioProbe): Promise<
  { ok: true; shape: ProjectShape; roadmap: Roadmap } | { ok: false; error: string }
> {
  const { scan, error } = await scanProject(probe);
  if (!scan) return { ok: false, error: error ?? 'the project could not be scanned' };
  const shape = analyzeProject(scan);
  return { ok: true, shape, roadmap: buildRoadmap(shape) };
}
