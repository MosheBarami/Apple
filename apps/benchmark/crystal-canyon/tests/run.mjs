#!/usr/bin/env node
// Run the game's Luau specs.
//
// The standalone Luau CLI is sandboxed and exposes no `io`, so it cannot read the modules
// under test. Node reads them and hands `luau` one complete chunk instead:
//
//     prelude (stubs `game`, shadows `require`)
//       .. each module's source, VERBATIM, wrapped in `local M = (function() … end)()`
//       .. the spec
//
// The module source is never edited. `local require` in the prelude shadows the global for
// everything after it in the same chunk, so a module's own `require(ReplicatedStorage.X)`
// resolves against the stub with no change to the file. What runs is what ships.
//
// Skips with a clear message when `luau` is absent, so a contributor without the toolchain
// is told rather than shown a green run that tested nothing.
import { readFileSync, writeFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { execFileSync, execFileSync as run } from 'node:child_process';
import { dirname, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const SRC = join(GAME, 'src');

function haveLuau() {
  try {
    execFileSync('luau', ['--help'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function luauMissing() { return !haveLuau(); }


// Roblox datatypes the modules construct at load time. Minimal on purpose: enough to let a
// module's own constants evaluate, and no behaviour a test could accidentally rely on. If a
// spec ever needs real Vector3 maths, that is a signal the thing under test belongs in Studio.
const PRELUDE = `
-- The stub instance tree. Modules are emitted dependency-first and each registers itself
-- here as it loads, so a later module's own require(ReplicatedStorage.CrystalCanyon.X) finds
-- the real X that this same chunk already evaluated.
-- Instance-shaped stubs. These exist so the server modules can be LOADED and CALLED;
-- they are not a reimplementation of Roblox. Each records what the module did to it so a
-- spec can assert on the effect (an attribute published, a remote fired) rather than on
-- the module's return value alone. Anything a stub cannot honestly model, it omits, so a
-- spec that depends on real engine behaviour fails loudly instead of passing against a
-- convenient fake.
local function __signal()
  local handlers = {}
  return {
    Connect = function(_self, fn)
      table.insert(handlers, fn)
      return { Disconnect = function() end }
    end,
    Fire = function(_self, ...)
      for _, fn in handlers do fn(...) end
    end,
    __count = function() return #handlers end,
  }
end

-- A Player stub. Attributes are the contract Zones publishes over, so they are recorded
-- verbatim, including the false values -- "not unlocked" is a real published state and a
-- spec must be able to tell it apart from "never published".
local function __player(name)
  local attrs, order = {}, {}
  local p
  p = {
    Name = name or "Tester",
    UserId = 1,
    Parent = { Name = "Players" },
    Character = nil,
    CharacterAdded = __signal(),
    SetAttribute = function(_self, key, value)
      if attrs[key] == nil then table.insert(order, key) end
      attrs[key] = value
    end,
    GetAttribute = function(_self, key) return attrs[key] end,
    GetAttributeChangedSignal = function(_self, _key) return __signal() end,
    __attrs = attrs,
    __attrOrder = order,
    __leave = function() p.Parent = nil end,
  }
  return p
end

-- A RemoteEvent that records rather than replicates.
local function __remote(name)
  local sent = {}
  return {
    Name = name,
    FireClient = function(_self, player, payload)
      table.insert(sent, { player = player, payload = payload })
    end,
    FireAllClients = function(_self, payload)
      table.insert(sent, { player = nil, payload = payload })
    end,
    OnServerEvent = __signal(),
    __sent = sent,
    __last = function() return sent[#sent] end,
  }
end

-- A folder whose WaitForChild mints a remote on demand, so a module can ask for whatever
-- it needs without the spec having to predeclare the list.
local function __remotesFolder()
  local made = {}
  return {
    Name = "Remotes",
    WaitForChild = function(_self, childName)
      if not made[childName] then made[childName] = __remote(childName) end
      return made[childName]
    end,
    FindFirstChild = function(self, childName) return made[childName] end,
    __made = made,
  }
end

-- The task library does not exist outside Roblox, and this runtime has no scheduler to stand in for
-- it. Rather than fake one, spawned work is RECORDED and not run, and any call that would
-- actually yield raises. A spec can then assert that a thread was started, and a code path
-- that depends on real scheduling fails loudly instead of passing against a fake clock.
-- warn is a Roblox global. Recording rather than printing keeps a passing run quiet and
-- lets a spec assert that a failure was actually announced -- several findings in
-- docs/FAILURES.md are precisely "it failed silently".
local __warnings = {}
local function warn(...)
  local parts = {}
  for i = 1, select("#", ...) do
    table.insert(parts, tostring((select(i, ...))))
  end
  table.insert(__warnings, table.concat(parts, " "))
end

local __spawned = {}
local task = {
  spawn = function(fn, ...)
    table.insert(__spawned, { fn = fn, args = table.pack(...) })
  end,
  defer = function(fn, ...)
    table.insert(__spawned, { fn = fn, args = table.pack(...) })
  end,
  delay = function(_seconds, fn, ...)
    table.insert(__spawned, { fn = fn, args = table.pack(...) })
  end,
  cancel = function() end,
  wait = function()
    error("spec: task.wait() would yield, and this harness runs no scheduler. Drive the "
      .. "code down a path that does not retry, or assert on __spawned instead.", 2)
  end,
}

-- A DataStore that keeps values in a table and honours the one contract this game depends
-- on: UpdateAsync runs the transform against the stored value, and a transform returning
-- nil aborts the write. __fail makes the next call throw, which is how a spec models an
-- outage. It is NOT a model of cross-server atomicity — a spec that needs that is asking
-- for something this runtime cannot honestly provide.
local function __dataStore()
  return {
    __values = {},
    __fail = false,
    __calls = 0,
    UpdateAsync = function(self, key, transform)
      self.__calls += 1
      if self.__fail then
        -- Worded to match DataService.looksPermanent, so a Studio spec short-circuits the
        -- retry backoff instead of reaching task.wait (which this harness raises on). A
        -- PRODUCTION spec cannot use this flag for the same reason: looksPermanent is only
        -- consulted in Studio, so a live-server outage would retry and hit that raise.
        -- Model a production outage with __dataStoreService.__fail instead, which leaves
        -- store nil and returns "error" without a round trip.
        error("403: Studio access to APIs is not allowed (spec-injected outage)", 0)
      end
      -- Through self, not the captured table, so a spec can reset __values between tests.
      local updated = transform(self.__values[key])
      if updated == nil then
        return nil
      end
      self.__values[key] = updated
      return updated
    end,
    GetAsync = function(self, key) return self.__values[key] end,
  }
end

local __store = __dataStore()
local __dataStoreService = {
  Name = "DataStoreService",
  __fail = false,
  GetDataStore = function(self, _name)
    if self.__fail then
      error("DataStoreService: spec-injected GetDataStore failure", 0)
    end
    return __store
  end,
}
local __httpService = {
  Name = "HttpService",
  __n = 0,
  GenerateGUID = function(self)
    self.__n += 1
    return string.format("00000000-0000-0000-0000-%012d", self.__n)
  end,
  JSONEncode = function(_self, v) return tostring(v) end,
}
-- Whether the module under test believes it is in Studio. Set per spec with --!studio,
-- because RunService:IsStudio() is read once at module load and cannot be changed after.
local __runService = { Name = "RunService", IsStudio = function() return __IS_STUDIO end }

local __playersList = {}
local __playersService = {
  Name = "Players",
  PlayerAdded = __signal(),
  PlayerRemoving = __signal(),
  GetPlayers = function() return __playersList end,
}
-- Workspace with no Canyon: Zones.prepareGates returns early rather than operating on a
-- fake world. Gate decoration is Studio's to prove, not this runtime's.
local __workspaceService = { Name = "Workspace", FindFirstChild = function() return nil end }

-- Modules reach their siblings two ways: by direct index, and by WaitForChild -- so the tree
-- answers both. WaitForChild never yields here: by the time a spec runs, every module the
-- spec declared is already loaded, and a miss is a spec bug worth raising immediately
-- rather than a 45-second hang.
local __canyon = { Name = "CrystalCanyon" }
function __canyon:WaitForChild(childName)
  local child = rawget(self, childName)
  if not child then
    error("spec: CrystalCanyon has no child " .. tostring(childName) .. " -- add it to --!modules", 2)
  end
  return child
end
__canyon.FindFirstChild = function(self, childName) return rawget(self, childName) end

local script = { Name = "spec", Parent = __canyon }

local __rs = { Name = "ReplicatedStorage", CrystalCanyon = __canyon }
__rs.WaitForChild = function(self, childName)
  local child = rawget(self, childName)
  if not child then
    error("spec: ReplicatedStorage has no child " .. tostring(childName), 2)
  end
  return child
end
__rs.FindFirstChild = __rs.WaitForChild
local __services = {
  ReplicatedStorage = __rs,
  Players = __playersService,
  Workspace = __workspaceService,
  DataStoreService = __dataStoreService,
  HttpService = __httpService,
  RunService = __runService,
}
local Vector3 = { new = function(x, y, z) return { X = x or 0, Y = y or 0, Z = z or 0 } end, zero = { X = 0, Y = 0, Z = 0 } }
local Vector2 = { new = function(x, y) return { X = x or 0, Y = y or 0 } end }
local Color3 = {
  fromRGB = function(r, g, b) return { R = (r or 0) / 255, G = (g or 0) / 255, B = (b or 0) / 255 } end,
  new = function(r, g, b) return { R = r or 0, G = g or 0, B = b or 0 } end,
}
-- Deliberately NOT a working PRNG. Roblox's Random is the thing that guarantees
-- determinism; a stub that reimplemented it would let a spec "prove" a guarantee this
-- runtime cannot make. It records the seed so a spec can check it was passed through.
local Random = { new = function(seed) return { __seed = seed } end }
local UDim = { new = function(s, o) return { Scale = s or 0, Offset = o or 0 } end }
local UDim2 = {
  new = function(xs, xo, ys, yo) return { X = { Scale = xs or 0, Offset = xo or 0 }, Y = { Scale = ys or 0, Offset = yo or 0 } } end,
  fromScale = function(x, y) return { X = { Scale = x or 0, Offset = 0 }, Y = { Scale = y or 0, Offset = 0 } } end,
  fromOffset = function(x, y) return { X = { Scale = 0, Offset = x or 0 }, Y = { Scale = 0, Offset = y or 0 } } end,
}
-- Enum answers any lookup with a distinct, comparable sentinel, so \Enum.A.B == Enum.A.B\
-- holds and a module can store one without the stub having to know the taxonomy.
local __enumCache = {}
local Enum = setmetatable({}, {
  __index = function(_, category)
    if not __enumCache[category] then
      __enumCache[category] = setmetatable({}, {
        __index = function(self, item)
          local v = rawget(self, "__" .. item)
          if not v then
            v = { EnumType = category, Name = item }
            rawset(self, "__" .. item, v)
          end
          return v
        end,
      })
    end
    return __enumCache[category]
  end,
})
local __boundToClose = {}
local game = {
  JobId = "",
  BindToClose = function(_self, fn) table.insert(__boundToClose, fn) end,
  GetService = function(_self, name)
    local svc = __services[name]
    if not svc then error("spec: no stub for game:GetService(\\"" .. tostring(name) .. "\\")", 2) end
    return svc
  end,
}
local require = function(target)
  if type(target) == "table" and rawget(target, "__module") ~= nil then
    return rawget(target, "__module")
  end
  error("spec: require() of something the stub tree does not carry", 2)
end
`;

/** Wrap a module's source so its trailing `return X` becomes a local binding. */
const wrap = (name, src) => `local ${name} = (function()\n${src}\nend)()\n`;

/** The modules a spec declares with `--!modules Name=dir/File,…`. */
export function declaredModules(specSrc) {
  const decl = /^--!modules\s+(.+)$/m.exec(specSrc);
  if (!decl) return null;
  return decl[1].split(',').map((s) => s.trim()).filter(Boolean).map((pair) => {
    const [name, rel] = pair.split('=');
    return { name: name.trim(), path: join(SRC, `${rel.trim()}.luau`) };
  });
}

/** Assemble one runnable Luau chunk from a spec and its modules.
 *  `mutate` (source, moduleName) => source lets mutation-check.mjs inject a bug into the
 *  source TEXT on its way into the chunk, so the file on disk is never modified. */
export function buildChunk(specSrc, mods, mutate = (src) => src) {
  // `--!studio true` makes RunService:IsStudio() answer true for this whole chunk. It has to
  // be a per-spec chunk setting rather than something a test toggles, because the module
  // reads IsStudio once at load — which is exactly why H2's production path went untested.
  const studio = /^--!studio\s+true\s*$/m.test(specSrc);
  return [
    `local __IS_STUDIO = ${studio}`,
    PRELUDE,
    ...mods.flatMap((m) => [
      wrap(m.name, mutate(readFileSync(m.path, 'utf8'), m.name)),
      `__canyon.${m.name} = { Name = "${m.name}", __module = ${m.name} }`,
    ]),
    `local H = (function()\n${readFileSync(join(HERE, 'harness.luau'), 'utf8')}\nend)()`,
    specSrc.replace(/^--!modules.*$/m, '').replace(/^--!studio.*$/m, '').replace(/local H = require\([^)]*\)\s*/g, ''),
  ].join('\n');
}

// Only run the suite when invoked directly; mutation-check.mjs imports the builder above.
function main() {
if (!haveLuau()) {
    console.log('crystal-canyon luau specs: SKIPPED — `luau` is not on PATH.');
    console.log('  These are the only tests that exercise the game\'s own Luau. Install the Luau');
    console.log('  CLI (https://github.com/luau-lang/luau/releases) to run them locally; CI does.');
    return 0;
  }
const specs = readdirSync(HERE).filter((f) => f.endsWith('.spec.luau')).sort();
if (specs.length === 0) {
  console.error('crystal-canyon luau specs: no *.spec.luau found');
  return 1;
}

const dir = mkdtempSync(join(tmpdir(), 'cc-luau-'));
let failures = 0;

for (const spec of specs) {
  const specSrc = readFileSync(join(HERE, spec), 'utf8');
  // A spec declares what it needs with `--!modules Config=shared/Config,Profile=server/Profile`
  const mods = declaredModules(specSrc);
  if (!mods) {
    console.error(`${spec}: missing a "--!modules" line declaring what to load`);
    failures += 1;
    continue;
  }
  const body = buildChunk(specSrc, mods);

  const out = join(dir, `${basename(spec, '.luau')}.gen.luau`);
  writeFileSync(out, body);
  try {
    const stdout = run('luau', [out], { encoding: 'utf8', stdio: 'pipe' });
    process.stdout.write(stdout);
  } catch (err) {
    failures += 1;
    process.stdout.write(err.stdout ?? '');
    process.stderr.write(err.stderr ?? '');
  }
}

return failures === 0 ? 0 : 1;
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
