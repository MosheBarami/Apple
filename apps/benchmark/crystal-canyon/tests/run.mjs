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
-- here as it loads, so a later module's \`require(ReplicatedStorage.CrystalCanyon.X)\` finds
-- the real X that this same chunk already evaluated.
local __canyon = { Name = "CrystalCanyon" }
local __rs = { Name = "ReplicatedStorage", CrystalCanyon = __canyon }
local __services = { ReplicatedStorage = __rs }
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
-- Enum answers any lookup with a distinct, comparable sentinel, so \`Enum.A.B == Enum.A.B\`
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
local game = {
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
  return [
    PRELUDE,
    ...mods.flatMap((m) => [
      wrap(m.name, mutate(readFileSync(m.path, 'utf8'), m.name)),
      `__canyon.${m.name} = { Name = "${m.name}", __module = ${m.name} }`,
    ]),
    `local H = (function()\n${readFileSync(join(HERE, 'harness.luau'), 'utf8')}\nend)()`,
    specSrc.replace(/^--!modules.*$/m, '').replace(/local H = require\([^)]*\)\s*/g, ''),
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
