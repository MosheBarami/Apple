// CURATION, not classification. 3,017 rows came back from GitHub; the question this file answers
// is which of them is a Roblox GAME MECHANIC that Apple may learn from, and it answers "no" far
// more often than "yes".
//
// THREE THINGS MAKE THIS DIFFERENT FROM A RANKING.
//
//  1. ABUSE IS A GATE, NOT A SCORE. A macro, an executor, an ESP module, an account generator: the
//     agent must never be able to reach one, so these are removed by a named rule that records the
//     word that fired it. A ranking would leave them in the table, reachable by anyone whose query
//     happened to match. `search roblox macro` is a query a customer could type.
//
//  2. "NOT A MECHANIC" IS A SEPARATE SENTENCE FROM "ABUSE". Rojo, StyLua and roblox-ts are
//     excellent software written by people who ship Roblox games. They are excluded because a
//     compiler is not a shop with gamepasses — and saying so in the same breath as "exploit" would
//     be a lie about their authors. The class is recorded on every exclusion.
//
//  3. A MECHANIC CLAIM COMES FROM THE FILE TREE, NEVER FROM THE README. The harvest's own first
//     page contains a Rust CSV tool that matched `topic:luau`; descriptions are what an author
//     wants you to believe. So a repository is kept only when a Luau file in its tree is NAMED
//     after the mechanic, and the path is quoted back as the evidence. A repository whose tree
//     could not be read is `unverified` — it is never promoted to kept, because a failure to
//     observe must not render as an observation.
//
// MATCHING IS ON WHOLE TOKENS, NEVER SUBSTRINGS. Running /hack|esp|macro|bot/ over this harvest
// really does flag StyLua ("hacktoberfest"), satchel ("works-with-codespaces") and jecs ("Flamework
// macros"). Every text is split into words, and a rule fires only on an exact word — plus the
// concatenation of adjacent words, so `ban-bypass`, `Account Creator` and `script hub` are single
// terms without `bypass` or `hub` becoming one on their own.

/* ----------------------------------------------------------------- what "outdated" means --- */

/**
 * Calls Roblox has REMOVED or formally deprecated, and what replaced each.
 *
 * `removed` means current clients throw or the member is gone: a file containing one is BROKEN, not
 * merely dated, and the repository citing it is dropped. `deprecated` still runs, so it is recorded
 * against the citation instead — the agent is told not to carry it forward.
 *
 * THIS IS THE ONLY COPY THE CURATOR AND THE FRESHNESS CHECK SHARE. Two lists that mean the same
 * thing drift, and a list that has drifted reports a repository as current because the rule that
 * would have caught it lives in the other file.
 */
export const API_RULES = [
  ['removed', /\bLoadLibrary\s*\(/, 'LoadLibrary was removed — use a ModuleScript with require()'],
  ['removed', /\bFilteringEnabled\b/, 'Workspace.FilteringEnabled was removed — filtering is always on'],
  ['removed', /:\s*remove\s*\(\s*\)/, ':remove() was removed — use :Destroy()'],
  ['removed', /:\s*children\s*\(\s*\)/, ':children() was removed — use :GetChildren()'],
  ['removed', /:\s*findFirstChild\s*\(/, ':findFirstChild() was removed — use :FindFirstChild()'],
  ['removed', /:\s*clone\s*\(\s*\)/, ':clone() was removed — use :Clone()'],
  ['removed', /\bgame\.Lighting\.Sky\b/, 'Lighting.Sky was replaced by a Sky instance'],
  ['deprecated', /\bBody(Velocity|Position|Gyro|Thrust|AngularVelocity)\b/, 'BodyMovers are deprecated — use LinearVelocity / AlignPosition / AlignOrientation'],
  ['deprecated', /(?<![.:\w])spawn\s*\(/, 'spawn() is deprecated — use task.spawn()'],
  ['deprecated', /(?<![.:\w])delay\s*\(/, 'delay() is deprecated — use task.delay()'],
  ['deprecated', /(?<![.:\w])wait\s*\(\s*[\d.]*\s*\)/, 'wait() is deprecated — use task.wait()'],
  ['deprecated', /GetService\(\s*["']Chat["']\s*\)/, 'the legacy Chat service is superseded by TextChatService'],
  ['deprecated', /\bRay\.new\s*\(/, 'Ray.new is superseded by workspace:Raycast()'],
  ['deprecated', /\bFindPartOnRay\w*\s*\(/, 'FindPartOnRay* is superseded by workspace:Raycast()'],
  ['deprecated', /\bDataStoreService:GetDataStore\([^)]*\)\s*:\s*GetAsync/, 'a bare GetAsync without UpdateAsync loses writes under contention — prefer UpdateAsync'],
];

/* --------------------------------------------------------------------------- tokenisation --- */

/**
 * Every whole word in a text, plus every concatenation of 2 and 3 adjacent words.
 *
 * `RobloxAccountCreator` -> roblox, account, creator, robloxaccount, accountcreator, ... so the
 * rule can name `accountcreator` and never fire on the word `creator` by itself, which is what
 * every Roblox developer calls themselves.
 */
export function terms(text) {
  if (!text) return new Set();
  const words = String(text)
    // camelCase and PascalCase are word boundaries: ShopService is two words, not one.
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out = new Set(words);
  for (let i = 0; i < words.length - 1; i++) {
    out.add(words[i] + words[i + 1]);
    if (i < words.length - 2) out.add(words[i] + words[i + 1] + words[i + 2]);
  }
  return out;
}

const fieldText = (repo, field) => field === 'name' ? repo.fullName
  : field === 'topics' ? (repo.topics ?? []).join(' ')
  : field === 'description' ? (repo.description ?? '')
  : '';

/* ------------------------------------------------------------------------ exclusion rules --- */

/**
 * `terms` always fire. `softTerms` are the generic words — "exploit", "cheat" — that appear just
 * as often in the repository that DEFENDS against them, so they stand down when a shield word is
 * present. Without that, `roblox-movement-anticheat` is excluded as a cheat by the word inside its
 * own name, and server-side validation is one of the mechanics Apple is asked to write.
 */
const SHIELDS = ['anticheat', 'anticheats', 'antiexploit', 'antiexploits', 'antihack',
  'cheatdetection', 'exploitdetection'];

export const EXCLUSION_RULES = [
  {
    id: 'exploit_tooling',
    class: 'abuse',
    why: 'an executor, injector, script hub, ESP or aim-assist: software written to break other '
      + "people's games. Nothing Apple builds may be informed by it, and a permissive licence on an "
      + 'exploit does not make it a template.',
    fields: ['name', 'topics', 'description'],
    // HARD — words that say what the repository IS. Nothing an honest anti-cheat calls itself.
    terms: ['executor', 'injector', 'scripthub', 'scripthubs', 'aimbot', 'aimlock', 'aimassist',
      'triggerbot', 'colorbot', 'wallhack', 'esp', 'silentaim', 'godmode', 'fecheat'],
    // SOFT — words the DEFENDER uses just as often. `RBXDefender-AntiCheat` exists "to protect
    // their games from exploiters"; an anti-cheat lists `hookfunction` and names Fluxus because
    // those are what it detects. These stand down when a shield word is present.
    softTerms: ['exploit', 'exploits', 'exploiting', 'exploiter', 'exploiters', 'cheat', 'cheats',
      'cheating', 'infiniteyield', 'gethui', 'getrenv', 'hookfunction', 'hookmetamethod',
      'synapsex', 'krnl', 'fluxus', 'scriptware', 'dexexplorer', 'remotespy', 'saveinstance'],
  },
  {
    id: 'automation_macro',
    class: 'abuse',
    why: 'a macro or auto-farm that plays a live Roblox game on the user\'s behalf. It is against '
      + 'the Roblox Terms of Use and it teaches nothing about building a game — it is about not '
      + 'playing one.',
    // NAME AND TOPICS ONLY. `jecs` says "Takes advantage of Flamework macros" in its description
    // and is a legitimate ECS wrapper: a macro is a language feature in one sentence and a cheat in
    // another. A repository that IS a macro says so in its name or its topics.
    fields: ['name', 'topics'],
    terms: ['macro', 'macros', 'autofarm', 'autofarming', 'farmingbot', 'autoclicker', 'autoplay',
      'afkfarm', 'gameautomation', 'robloxautomation', 'robloxmacro', 'grindbot', 'autogrind'],
    softTerms: [],
  },
  {
    id: 'account_abuse',
    class: 'abuse',
    why: 'account generation, captcha solving, credential theft, ban evasion or trade botting. This '
      + 'targets Roblox players and Roblox itself; it is not a game system under any reading.',
    fields: ['name', 'topics', 'description'],
    terms: ['spoofer', 'spoofing', 'byfron', 'hyperion', 'banbypass', 'accountcreator',
      'accountgenerator', 'accountgen', 'altgenerator', 'captchasolver', 'funcaptcha', 'cookiegrabber',
      'tokengrabber', 'tokensgrabber', 'stealer', 'stealers', 'tradebot', 'tradingbot', 'nuke',
      'nuker', 'pincracker', 'cracker', 'botter', 'botting', 'massunfriend', 'groupleaver'],
    softTerms: [],
  },
  {
    id: 'client_tampering',
    class: 'abuse',
    why: 'patches, re-hosts or tampers with the Roblox client itself — revivals, offset guides, '
      + 'DLL work. Even where the code is open and well written, it is not a mechanic and pointing '
      + 'a customer at it is pointing them at a ban.',
    fields: ['name', 'topics', 'description'],
    terms: ['revival', 'revivals', 'autopatcher', 'clientpatcher', 'offsets', 'offsetguides',
      'dllinjection', 'internaldll', 'robloxinjector'],
    softTerms: [],
  },

  /* ----------- below here: legitimate software that simply is not a game mechanic ----------- */

  {
    id: 'developer_tooling',
    class: 'not-a-mechanic',
    why: 'a compiler, formatter, linter, language server, editor plugin or build tool. It helps '
      + 'people write Roblox games; it is not a system that runs inside one.',
    fields: ['topics', 'description'],
    terms: ['compiler', 'transpiler', 'formatter', 'luaformatter', 'prettyprinter', 'linter',
      'languageserver', 'lsp', 'syntaxhighlighting', 'codeeditor', 'buildtool', 'packagemanager',
      'githubaction', 'continuousintegration', 'testrunner', 'benchmarking', 'bindings',
      'decompiler', 'disassembler', 'mcpserver', 'apiwrapper', 'sdk', 'cli'],
    softTerms: [],
  },
  {
    id: 'not_in_game',
    class: 'not-a-mechanic',
    why: 'it runs outside the Roblox client — a Discord bot, an Open Cloud service, a website, a '
      + 'bootstrapper or a desktop launcher. An in-game mechanic is Luau running in a place.',
    fields: ['topics', 'description'],
    terms: ['discordbot', 'discordbots', 'bootstrapper', 'launcher', 'fastflag', 'fastflags',
      'fflags', 'webapp', 'website', 'browserextension', 'chromeextension', 'desktopapp'],
    softTerms: [],
  },
  {
    id: 'library_not_mechanic',
    class: 'not-a-mechanic',
    why: 'a general-purpose library — state management, an ECS, a signal, a promise, a UI toolkit. '
      + 'Real craft, and the agent may well depend on one, but it demonstrates no mechanic: a store '
      + 'is not a shop and a signal is not a round system.',
    fields: ['topics', 'description'],
    terms: ['uilibrary', 'uiframework', 'statemanagement', 'statecontainer', 'ecs', 'entitycomponentsystem',
      'signallibrary', 'promiselibrary', 'serialization', 'serialisation', 'datastructures',
      'typedefinitions', 'reactivelibrary', 'immutable', 'hashing', 'messagepack'],
    softTerms: [],
  },
];

/**
 * The first rule that fires, with the exact word that fired it.
 *
 * Order matters and abuse is first: a repository that is both an exploit and a Discord bot is an
 * exploit. Returning the softer reason would be the kinder sentence and the wrong one.
 */
export function excludeReason(repo) {
  const shield = ['name', 'topics', 'description']
    .some((f) => { const t = terms(fieldText(repo, f)); return SHIELDS.some((s) => t.has(s)); });
  for (const rule of EXCLUSION_RULES) {
    for (const field of rule.fields) {
      const t = terms(fieldText(repo, field));
      const hit = rule.terms.find((x) => t.has(x))
        ?? (shield ? undefined : rule.softTerms.find((x) => t.has(x)));
      if (hit) return { rule: rule.id, class: rule.class, why: rule.why, matched: hit, field };
    }
  }
  return null;
}

/* ------------------------------------------------------------------------- the vocabulary --- */

/**
 * The mechanics Apple can be asked for, named the way a builder asks.
 *
 * The ids are the roadmap's own `FeatureId` vocabulary wherever one exists, so what the roadmap
 * DETECTS in a place and what this library can TEACH are the same word. A second vocabulary would
 * drift out of agreement with the first, which is a failure this repository has already had.
 *
 * `terms` are matched against the words in a Luau file's PATH. `ServerScriptService/ShopService.lua`
 * is `shop`; a repository whose only mention of a shop is in its README is not.
 */
const SYSTEM_SUFFIXES = ['service', 'handler', 'controller', 'manager', 'system', 'module',
  'component', 'client', 'server', 'ui', 'gui', 'script', 'data', 'config',
  'generator', 'spawner', 'loader', 'builder', 'provider', 'logic', 'core'];

const MECHANIC_SPECS = [
  { id: 'persistence', label: 'saving player data across sessions', roadmap: true, bases: ['save', 'profile', 'playerdata'], exact: ['datastore', 'datastores', 'datastoreservice', 'ordereddatastore', 'profilestore', 'playerdata', 'playerprofile', 'savedata'] },
  { id: 'currency', label: 'a currency and leaderstats', roadmap: true, bases: ['currency', 'economy', 'wallet', 'coin', 'cash', 'gem'], exact: ['leaderstats'] },
  { id: 'shop', label: 'a shop the player buys from', roadmap: true, bases: ['shop', 'storefront', 'vendor', 'shopkeeper'], exact: [] },
  { id: 'monetization', label: 'gamepasses and developer products', roadmap: true, bases: ['monetization', 'monetisation', 'purchase', 'receipt', 'gamepass'], exact: ['gamepass', 'gamepasses', 'marketplaceservice', 'developerproduct', 'developerproducts', 'processreceipt', 'promptpurchase', 'promptgamepasspurchase'] },
  { id: 'inventory', label: 'an inventory or backpack', roadmap: false, bases: ['inventory', 'backpack'], exact: ['hotbar', 'loadout', 'itemslot'] },
  { id: 'pets', label: 'pets, eggs and hatching', roadmap: true, bases: ['pet', 'egg'], exact: ['hatchegg', 'egghatch'] },
  { id: 'leaderboard_global', label: 'a cross-server leaderboard', roadmap: true, bases: ['leaderboard'], exact: ['leaderboard', 'leaderboards', 'globalleaderboard', 'ordereddatastore'] },
  { id: 'round_system', label: 'rounds, intermission and a match loop', roadmap: true, bases: ['round', 'match', 'lobby'], exact: ['intermission', 'matchmaking', 'gameloop', 'roundstart'] },
  { id: 'checkpoints', label: 'an obby with staged checkpoints', roadmap: true, bases: ['checkpoint', 'stage'], exact: ['checkpoint', 'checkpoints', 'obby'] },
  { id: 'killbricks', label: 'hazards that kill or damage on touch', roadmap: true, bases: ['hazard', 'killbrick'], exact: ['killbrick', 'killbricks', 'killpart', 'damagepart', 'lavapart'] },
  { id: 'weapons', label: 'weapons and tools that deal damage', roadmap: true, bases: ['weapon', 'gun', 'sword', 'combat', 'damage'], exact: ['raycasthitbox', 'hitbox'] },
  { id: 'enemies', label: 'NPC enemies that chase and attack', roadmap: true, bases: ['enemy', 'mob', 'zombie', 'npc'], exact: ['enemyai', 'bossfight'] },
  { id: 'waves', label: 'a wave spawner', roadmap: true, bases: ['wave'], exact: ['wavespawner', 'spawnwave', 'nextwave'] },
  { id: 'towers', label: 'placeable towers and turrets', roadmap: true, bases: ['tower', 'turret'], exact: ['towerplacement'] },
  // NOT the bare word `waypoint`. In Roblox it means two unrelated things, and the commoner one is
  // ChangeHistoryService's undo waypoint: `addUndoWaypoint.luau` and `setWaypoint.luau` are Studio
  // plugin code, and both were cited as pathfinding by the first run of this curator.
  { id: 'path_waypoints', label: 'pathfinding and waypoints enemies walk', roadmap: true, bases: ['pathfinding', 'waypoint'], exact: ['pathfinding', 'pathfindingservice', 'navmesh', 'simplepath'] },
  { id: 'upgrades', label: 'upgrades, levels and tiers', roadmap: true, bases: ['upgrade', 'levelling', 'leveling', 'experience'], exact: ['skilltree', 'levelup'] },
  { id: 'rebirth', label: 'a rebirth or prestige loop', roadmap: true, bases: ['rebirth', 'prestige'], exact: ['rebirth', 'rebirths', 'prestige', 'ascension'] },
  { id: 'dropper', label: 'a tycoon dropper and conveyor chain', roadmap: true, bases: ['tycoon', 'dropper', 'conveyor', 'collector'], exact: ['dropper', 'droppers', 'conveyor', 'conveyors', 'tycoon'] },
  { id: 'plots', label: 'claimable plots or bases', roadmap: true, bases: ['plot'], exact: ['claimplot', 'plotowner'] },
  { id: 'quests', label: 'quests, missions and objectives', roadmap: true, bases: ['quest', 'mission', 'objective'], exact: [] },
  { id: 'dialogue', label: 'NPC dialogue and prompts', roadmap: true, bases: ['dialogue', 'conversation'], exact: ['proximityprompt', 'npcdialogue'] },
  { id: 'daily_reward', label: 'a daily reward and login streak', roadmap: true, bases: ['dailyreward'], exact: ['dailyreward', 'dailyrewards', 'dailybonus', 'loginstreak'] },
  { id: 'badges', label: 'badges awarded for milestones', roadmap: true, bases: ['badge', 'achievement'], exact: ['badgeservice', 'awardbadge'] },
  { id: 'anticheat', label: 'server-side validation of what the client claims', roadmap: true, bases: ['anticheat', 'antiexploit', 'ratelimit'], exact: ['anticheat', 'antiexploit', 'antihack', 'sanitycheck', 'ratelimiter', 'exploitdetection', 'servervalidation'] },
  { id: 'vehicles', label: 'a drivable vehicle chassis', roadmap: true, bases: ['vehicle', 'car', 'kart'], exact: ['chassis', 'drivetrain', 'suspension'] },
  { id: 'racing_track', label: 'laps, checkpoints and a finish line', roadmap: true, bases: ['race', 'lap'], exact: ['lapcount', 'laptime', 'finishline', 'racetrack'] },
  { id: 'teams', label: 'teams and team balancing', roadmap: true, bases: ['team'], exact: ['teambalance', 'teamselect'] },
  { id: 'customization', label: 'skins, outfits and cosmetics', roadmap: true, bases: ['customization', 'customisation', 'skin', 'outfit', 'cosmetic'], exact: ['characterappearance', 'avatareditor'] },
  { id: 'tutorial', label: 'a first-time-player tutorial', roadmap: true, bases: ['tutorial', 'onboarding'], exact: ['firsttimeplayer'] },
  { id: 'remotes', label: 'client/server messaging over remotes', roadmap: true, bases: ['network', 'remote'], exact: ['remoteevent', 'remotefunction', 'remotes'] },
  { id: 'ragdoll', label: 'a ragdoll on death or knockback', roadmap: false, bases: ['ragdoll'], exact: ['ragdoll', 'ragdolls'] },
  { id: 'placement', label: 'placing and rotating a model on a grid', roadmap: false, bases: ['placement'], exact: ['gridplacement', 'buildmode', 'buildingsystem'] },
  { id: 'zones', label: 'named zones a player enters and leaves', roadmap: true, bases: ['zone'], exact: ['zoneplus', 'quickzone'] },
  { id: 'camera', label: 'a custom camera', roadmap: false, bases: ['camera'], exact: ['freecam', 'shiftlock'] },
  { id: 'admin_commands', label: 'in-game moderation commands', roadmap: false, bases: ['admin', 'moderation', 'command'], exact: ['admincommands', 'adonis', 'cmdr'] },
  { id: 'procedural_terrain', label: 'procedurally generated terrain or maps', roadmap: false, bases: ['terrain', 'chunk'], exact: ['proceduralgeneration', 'terraingenerator', 'chunkloader', 'mapgenerator', 'worldgenerator', 'perlin', 'voxel'] },
];

/**
 * A MECHANIC IS A SYSTEM; A BARE NOUN IS JUST A WORD. `bases` match only as a compound —
 * `ShopService`, `PetHandler`, `RoundSystem` — because the first version of this list accepted the
 * bare noun and cited `lib/widgets/Plot.lua` from a debug-GUI library as a claimable plot system,
 * and `TestEZ/Reporters/TeamCityReporter.lua` as a team system. `exact` holds the words that can
 * only ever mean the mechanic: `leaderstats`, `killbrick`, `ragdoll`, `ProcessReceipt`.
 */
export const MECHANICS = MECHANIC_SPECS.map((m) => ({
  id: m.id,
  label: m.label,
  roadmap: m.roadmap,
  // Singular AND plural. `ChunksManager.luau` and `ItemsData.luau` are how people actually name
  // these files, and a singular-only list read a whole voxel terrain engine as having no mechanic.
  terms: [...new Set(m.bases.flatMap((b) => [b, b + 's'])
    .flatMap((b) => SYSTEM_SUFFIXES.map((s) => b + s))
    .concat(m.exact))],
}));

export const MECHANIC_IDS = MECHANICS.map((m) => m.id);

const LUAU_FILE = /\.(lua|luau)$/i;

/**
 * Directories whose contents are not this repository's own implementation.
 *
 * `Packages/` and `DevPackages/` are where Wally installs somebody else's code: citing a file
 * there would credit this repository's author for a library they merely depend on, and provenance
 * is the entire product. `test`, `fixtures` and `vendor` are not implementations either — the first
 * run of this curator cited `tests/cli/format/fixtures/gitignored/vendor/dep.luau` as a shop.
 * `config` and `settings` are values, not mechanisms.
 */
const NON_SOURCE_DIRS = new Set(['test', 'tests', '__tests__', 'spec', 'specs', 'testez',
  'vendor', 'vendored', 'thirdparty', 'third_party', 'node_modules', 'packages', 'devpackages',
  'serverpackages', 'fixture', 'fixtures', 'example', 'examples', 'demo', 'demos', 'sample',
  'samples', 'docs', 'doc', 'site', 'storybook', 'stories', 'benchmark', 'benchmarks', 'bench',
  'dist', 'build', 'out', 'config', 'configs', 'settings', 'lune', '.lune']);

/** A file that stands in for an implementation rather than being one. */
const NON_SOURCE_WORDS = new Set(['test', 'tests', 'spec', 'mock', 'mocks', 'fake', 'stub',
  'dummy', 'example', 'benchmark', 'story', 'stories']);

export function isSourcePath(path) {
  if (!LUAU_FILE.test(path)) return false;
  const parts = path.split('/');
  for (const dir of parts.slice(0, -1)) if (NON_SOURCE_DIRS.has(dir.toLowerCase())) return false;
  for (const w of terms(parts[parts.length - 1])) if (NON_SOURCE_WORDS.has(w)) return false;
  return true;
}

/** Every mechanic a Luau path in this tree is NAMED after, with the path quoted back. */
export function mechanicsFromTree(tree) {
  const found = new Map();
  for (const path of tree) {
    if (!isSourcePath(path)) continue;
    const t = terms(path);
    for (const m of MECHANICS) {
      if (found.has(m.id)) continue;
      const hit = m.terms.find((x) => t.has(x));
      if (hit) found.set(m.id, { id: m.id, label: m.label, via: 'tree', where: path, matched: hit });
    }
  }
  return [...found.values()];
}

/** What the author SAYS it does. Recorded, never sufficient — this is the README, not the code. */
export function claimsFromMetadata(repo) {
  const t = new Set([...terms((repo.topics ?? []).join(' ')), ...terms(repo.description ?? '')]);
  return MECHANICS.filter((m) => m.terms.some((x) => t.has(x))).map((m) => m.id);
}

/**
 * A language that cannot run inside a Roblox place. Recorded as a list rather than as "not Luau"
 * so a null language — 1,055 of the 3,017 rows have one — falls through to the tree, which is the
 * only thing that actually knows.
 */
const HOST_LANGUAGES = ['Rust', 'C++', 'C#', 'C', 'Python', 'Go', 'Java', 'Kotlin', 'Swift',
  'AutoHotkey', 'Shell', 'PowerShell', 'Ruby', 'PHP', 'Dart', 'Objective-C', 'Nim', 'Zig'];

/**
 * Keep or exclude one repository, and say why either way.
 *
 * `evidence.tree` is the list of file paths read from the repository. Omit it and the answer can
 * only ever be an exclusion: without the tree there is nothing that could justify a keep, and
 * `unverified` is returned rather than a guess.
 */
export function curate(repo, evidence = {}) {
  const exclusion = excludeReason(repo);
  if (exclusion) return { kept: false, exclusion };

  // WHAT IT IS comes before WHETHER IT IS USABLE. `qsv` is a Rust CSV tool that matched
  // `topic:luau` because it embeds Luau as a scripting language, and it also carries NOASSERTION.
  // Both are true; only one of them is the reason a Roblox builder will never want it, and an
  // exclusion is worth nothing if it gives the incidental reason.
  if (repo.language && HOST_LANGUAGES.includes(repo.language)) {
    return { kept: false, exclusion: { rule: 'not_luau', class: 'not-a-mechanic', matched: repo.language, field: 'language',
      why: `the repository is ${repo.language}. A mechanic runs inside a Roblox place, which means Luau — a host-language project talks ABOUT Roblox from outside it.` } };
  }
  if (repo.archived) {
    return { kept: false, exclusion: { rule: 'archived', class: 'not-a-mechanic', matched: 'archived', field: 'repo',
      why: 'the repository is archived: its author has declared it finished and unmaintained, so nothing here tracks the current Roblox API.' } };
  }
  if (!repo.licence || repo.licence === 'NOASSERTION') {
    return { kept: false, exclusion: { rule: 'no_licence', class: 'unverified', matched: String(repo.licence ?? 'none'), field: 'licence',
      why: 'GitHub detected no licence, so the code is All Rights Reserved by default. The licence has to travel with the citation, and there is nothing to travel.' } };
  }

  const tree = evidence.tree;
  if (!Array.isArray(tree)) {
    return { kept: false, exclusion: { rule: 'tree_not_read', class: 'unverified', matched: evidence.treeError ?? 'no tree supplied', field: 'tree',
      why: `the file tree was not read (${evidence.treeError ?? 'no tree supplied'}), so no mechanic claim could be checked against the code. Unread is not clean.` } };
  }

  const mechanics = mechanicsFromTree(tree);
  if (!mechanics.length) {
    return { kept: false, exclusion: { rule: 'no_mechanic_evidence', class: 'not-a-mechanic', matched: `${tree.length} paths`, field: 'tree',
      why: 'the tree was read and no Luau file in it is named after a mechanic. The repository may still be excellent; it demonstrates nothing the agent can be asked for by name.' } };
  }

  return {
    kept: true,
    mechanics,
    // Recorded beside, never merged: what the author claims and what the tree shows are two facts,
    // and a reader who cannot see the difference cannot check the curator.
    claimed: claimsFromMetadata(repo),
  };
}
