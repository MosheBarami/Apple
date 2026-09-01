/**
 * `run_luau`'s asset-ingress gate — the only control on the one op that bypasses the
 * plugin's asset policy.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. `Paths.setProp` in the plugin refuses an
 * unverified MeshId / Texture / SoundId, which covers `create_instances` and
 * `set_properties`. `run_code` executes Luau straight against the engine and never
 * goes through `setProp`, so that policy does not apply to it at all. This function
 * is what stands in its place, and it had no tests: the loop gate beside it is pinned
 * by three separate mutations while the filter guarding a strictly more
 * security-relevant property was unpinned.
 *
 * The last section is the important one. This is NOT a sandbox, the bypasses are
 * known and measured, and they are asserted here as bypasses — so that nobody
 * downstream builds on an assumption this file can show is false.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// tools.ts imports across the worker with extensionless specifiers, which Node's type
// stripping cannot resolve, so it is bundled — the same way packages/evals does it.
const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const bundle = join(mkdtempSync(join(tmpdir(), 'ingress-')), 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + bundle], { stdio: 'pipe' });
const { refuseLuauIngress, scanLuauForAssetIngress } = await import(bundle);

const codes = (src) => scanLuauForAssetIngress(src).map((f) => f.code).sort();
const refused = (src) => refuseLuauIngress(src) !== null;

// ------------------------------------------------------------- the primitives --

test('game:GetObjects is refused — it is what insert_asset exists to gate', () => {
  assert.deepEqual(codes('local m = game:GetObjects("rbxassetid://1")'), ['asset_uri', 'get_objects']);
  assert.ok(refused('local m = game:GetObjects(id)'));
});

test('InsertService and its two load calls are refused', () => {
  for (const src of [
    'local s = game:GetService("InsertService")',
    'local m = svc:LoadAsset(123)',
    'local m = svc:LoadAssetVersion(456)',
  ]) {
    assert.ok(refused(src), src);
    assert.ok(codes(src).includes('insert_service'), src);
  }
});

test('an asset URI literal is refused whatever scheme it uses', () => {
  for (const uri of ['rbxassetid://1', 'rbxthumb://type=Asset&id=1', 'rbxhttp://x', 'rbxgameasset://Models/T']) {
    assert.ok(refused(`p.MeshId = "${uri}"`), uri);
  }
  // Case-insensitive: the scheme is not a reliable capitalisation.
  assert.ok(refused('p.MeshId = "RBXASSETID://1"'));
});

test('Content.fromAssetId and Content.fromUri are refused', () => {
  assert.ok(codes('local c = Content.fromAssetId(1)').includes('content_from_asset'));
  assert.ok(codes('local c = Content.fromUri(u)').includes('content_from_asset'));
  // Spacing around the dot must not be an escape.
  assert.ok(codes('local c = Content . fromAssetId (1)').includes('content_from_asset'));
});

test('runtime code construction is refused, because nothing above it can be checked', () => {
  for (const src of ['loadstring(s)()', 'getfenv(1).x = 2', 'setfenv(f, {})']) {
    assert.ok(codes(src).includes('dynamic_code'), src);
  }
});

test('computed indexing of `game` is refused outright', () => {
  // `game.GetObjects` is caught by name; `game[k]` hides which member is reached, so
  // the shape itself is refused rather than the name.
  assert.ok(codes('local f = game[k]').includes('computed_member'));
  assert.ok(codes('local f = game[ svc ]').includes('computed_member'));
  // A quoted member is legible and is NOT this rule's target.
  assert.ok(!codes('local f = game["Workspace"]').includes('computed_member'));
});

// ------------------------------------------------------------ literal folding --

test('splitting a URI across concatenated literals does not evade the scan', () => {
  assert.ok(refused('p.MeshId = "rbxassetid" .. "://999"'));
  assert.ok(refused('p.MeshId = "rbxass" .. "etid://" .. "999"'));
});

// ------------------------------------------------------------------- require --

test('require by asset id is refused — the classic marketplace backdoor', () => {
  for (const src of ['require(1234567)', 'require("1234567")', 'require( 42 )']) {
    assert.ok(codes(src).includes('require_asset_id'), src);
  }
});

test('require of something the source does not name is refused', () => {
  for (const src of ['require(tonumber(s))', 'require(x)', 'require(f())']) {
    assert.ok(codes(src).includes('require_computed'), src);
  }
});

test('require by path is allowed, because that is what legitimate use looks like', () => {
  for (const src of [
    'require(script.Parent.Config)',
    'local SS = game:GetService("ServerScriptService") local m = require(SS.Modules.Config)',
    'require(ReplicatedStorage.Shared.Util)',
  ]) {
    assert.equal(refused(src), false, src);
  }
});

// -------------------------------------------------------- ordinary work passes --

test('the tool remains useful — none of its real work is refused', () => {
  // A gate that refuses ordinary scripting gets routed around, so this is a security
  // property too, not a convenience one.
  for (const src of [
    'for i = 1, 100 do local p = Instance.new("Part") p.Parent = workspace end',
    'workspace.Terrain:FillBlock(CFrame.new(0,0,0), Vector3.new(10,10,10), Enum.Material.Grass)',
    'for _, d in workspace:GetDescendants() do if d:IsA("BasePart") then d.Anchored = true end end',
    'local n = 0 for _, d in workspace:GetDescendants() do n += 1 end return n',
    'local c = workspace.CurrentCamera c.CFrame = CFrame.lookAt(Vector3.new(0,10,0), Vector3.zero)',
  ]) {
    assert.equal(refused(src), false, src);
  }
});

test('a comment mentioning a primitive is not a use of it', () => {
  assert.equal(refused('-- do not use GetObjects here\nprint(1)'), false);
  assert.equal(refused('--[[ loadstring is refused ]]\nprint(1)'), false);
});

// ---------------------------------------------------------------- the refusal --

test('the refusal names the tool to use instead, and which primitive tripped it', () => {
  const r = refuseLuauIngress('game:GetObjects(1)');
  assert.ok(r);
  assert.match(r.error, /insert_asset/);
  assert.match(r.error, /search_asset_library|find_verified_asset/);
  assert.ok(r.blocked.includes('get_objects'));
  // An agent that cannot tell WHAT it did wrong retries the same thing.
  assert.match(r.error, /GetObjects/);
});

test('clean code returns null rather than an empty refusal', () => {
  assert.equal(refuseLuauIngress('return 1 + 1'), null);
});

// ------------------------------------------------------ THE KNOWN BYPASSES ----
//
// tools.ts documents these as measured and still allowed. They are asserted so the
// documentation cannot quietly become false in either direction: if one starts being
// refused, this goes red and the comment needs updating; and more importantly, nobody
// reading the gate can assume `run_code` is covered the way the other two ops are.
//
// The exposure is LICENCE-AND-PROVENANCE, not code execution — these properties load
// inert media. That is the reason it is accepted rather than closed.

test('KNOWN GAP: a computed asset URI reaches a content property unrefused', () => {
  const bypasses = [
    'local a, b = "rbxassetid", "://999" m.MeshId = a .. b',
    'm.MeshId = string.format("%s://%d", "rbxassetid", 999)',
    'm.MeshId = table.concat({"rbxasset", "id://999"})',
  ];
  for (const src of bypasses) {
    assert.equal(refused(src), false,
      `${src}\n  This is documented in tools.ts as an accepted gap. If it now REFUSES, that is ` +
      'good news and the comment there should stop saying it is allowed.');
  }
});

test('KNOWN GAP: the literal fold reaches adjacent literals only', () => {
  // Two literals joined directly fold and are caught (asserted above). Route the same
  // value through a variable and the fold cannot see it. This is the boundary.
  assert.equal(refused('local x = "rbxassetid://1" m.MeshId = x'), true, 'a bare literal is still visible');
  assert.equal(refused('local a = "rbxassetid" local b = "://1" m.MeshId = a .. b'), false,
    'through variables it is not — the fold is textual');
});
