// INSTALL MANIFEST COVERAGE
//
// WHAT THIS PROTECTS. `world/Install.luau` is the ONLY supported way Crystal Canyon
// gets into a place, and it installs an explicit hand-written list. A source file
// that exists, compiles, is committed, and is simply absent from that list is
// therefore invisible: the repo looks complete and the running game is missing a
// module.
//
// THIS ALREADY HAPPENED, WHICH IS WHY THE TEST EXISTS. `src/client/Icons.luau` — the
// shared pictogram family, 356 lines — was written and committed and never added to
// the manifest. The two consumers fail differently, and that is the nasty part:
//
//   * Hud.luau waits BOUNDED, `WaitForChild("Icons", 5)`, and degrades to a printed
//     "drawing without pictograms". Visible, survivable.
//   * Panels.luau waits UNBOUNDED, `WaitForChild("Icons")`, so it never finishes
//     loading. Every panel in the game — shop, upgrades, codes — was silently dead
//     in play, announced only by a greppable "Infinite yield possible" warning.
//
// A playtest can be run, screenshotted and called green while that is true, because
// the HUD still draws. So the invariant is asserted here rather than trusted to
// review.
//
// These are assertions about the SHIPPING installer, parsed from the Luau source, not
// about a replica of the list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const GAME = join(REPO, 'apps', 'benchmark', 'crystal-canyon');
const INSTALLER = join(GAME, 'world', 'Install.luau');

const installerSrc = readFileSync(INSTALLER, 'utf8');

// Manifest rows look like:  { "src/client/Hud.luau", "client", "Hud", "ModuleScript" },
// Comments inside the table are ordinary Luau block comments and cannot match this,
// because a row is anchored on a quoted repo path in the first position.
const ROW = /\{\s*"(src\/[^"]+\.luau)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\}/g;
const rows = [...installerSrc.matchAll(ROW)].map(([, path, parent, name, className]) => ({
  path,
  parent,
  name,
  className,
}));

// Every .luau under src/, recursively.
function luauUnder(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...luauUnder(join(dir, entry.name), rel));
    else if (entry.name.endsWith('.luau')) out.push(`src/${rel}`);
  }
  return out;
}
const sources = luauUnder(join(GAME, 'src'));

test('the manifest parses to a non-trivial list', () => {
  assert.ok(rows.length >= 15, `parsed only ${rows.length} manifest rows — the row regex has probably drifted`);
});

test('every source module under src/ is installed', () => {
  const installed = new Set(rows.map((r) => r.path));
  const missing = sources.filter((s) => !installed.has(s));
  assert.deepEqual(
    missing,
    [],
    `these files exist in the repo but Install.luau never puts them in the place, so they are absent at runtime: ${missing.join(', ')}`,
  );
});

test('every manifest entry points at a file that exists', () => {
  const dangling = rows.filter((r) => !existsSync(join(GAME, r.path)));
  assert.deepEqual(
    dangling.map((r) => r.path),
    [],
    'the installer would report these as FAILED at install time',
  );
});

test('no two manifest entries claim the same parent and name', () => {
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.parent}/${r.name}`;
    assert.ok(!seen.has(key), `${key} is installed twice — ${seen.get(key)} then ${r.path}, and the second silently wins`);
    seen.set(key, r.path);
  }
});

// ------------------------------------------------------------------ the real one
//
// The coverage test above only catches a file that is missing ENTIRELY. This catches
// the thing that actually bit: a module resolved at RUNTIME by name that the manifest
// does not install. `script.Parent:WaitForChild("X")` inside a client or server module
// resolves against that module's installed siblings, so "X" must be a manifest `name`
// under the same parent.
test('every sibling module required at runtime is installed under the same parent', () => {
  const byParent = new Map();
  for (const r of rows) {
    if (!byParent.has(r.parent)) byParent.set(r.parent, new Set());
    byParent.get(r.parent).add(r.name);
  }

  // Instances supplied by Roblox or created at runtime rather than installed by the
  // manifest. A sibling require can never legitimately name one of these, so they are
  // excluded by name rather than by guessing at the call site.
  const ENGINE_PROVIDED = new Set(['Humanoid', 'PlayerGui', 'CrystalCanyon']);

  const failures = [];
  for (const r of rows) {
    const src = readFileSync(join(GAME, r.path), 'utf8');
    const siblings = byParent.get(r.parent) ?? new Set();
    for (const m of src.matchAll(/script\.Parent:WaitForChild\(\s*"([A-Za-z_][A-Za-z0-9_]*)"/g)) {
      const wanted = m[1];
      if (ENGINE_PROVIDED.has(wanted)) continue;
      if (!siblings.has(wanted)) {
        failures.push(`${r.path} requires sibling "${wanted}", which the manifest never installs under "${r.parent}"`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});
