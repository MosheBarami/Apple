/**
 * THE REPORT THIS PLUGIN ACTUALLY SENDS, THROUGH THE PARSER THE WORKER ACTUALLY RUNS.
 *
 * `apps/worker/tests/plugin-capabilities.test.mjs` is thorough about the worker's half and every
 * report it feeds in is SYNTHETIC — hand-written objects with hand-written refusal strings that do
 * not match this plugin's. Nothing has ever taken the bytes `Commands.capabilities` emits and run
 * them through `parsePluginCapabilities`. That gap matters more than it looks, because of how the
 * worker fails:
 *
 *     parsePluginCapabilities returns null  ->  COMPATIBILITY MODE  ->  every tool is offered
 *
 * A report that is one field out does not produce an error anywhere. It produces a session where
 * the agent is handed `run_luau` and `inspect_visually`, calls them, collects
 * refusals one at a time, and is never told at the start what this Studio cannot do. Worse, the
 * sentence SessionDO appends when the visual gate is withheld — "Rendered appearance was not
 * verified" — is keyed off `withheld`, so it would never appear either: the user would be told
 * nothing at all. That is a failure to observe rendering as an observation, and the only way to
 * know it is not happening is to run both halves against each other, which is this file.
 *
 * It is also the place the COST of the decision is written down. Shipping this plugin withholds
 * arbitrary execution tools whose safe typed replacements do not exist. The exact list is asserted below as a TRIPWIRE — it is meant to fire on any change,
 * because every entry is a capability a user loses and each new one needs a human to look at it.
 * If it fires, write the review; do not edit the list to match.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PRELUDE } from './studio-mock.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..', '..', 'worker');
const COMMANDS = readFileSync(join(HERE, '..', 'src', 'Commands.luau'), 'utf8');

const luauMissing = (() => {
  try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return false; } catch { return true; }
})();

// ---------------------------------------------------------------------------------------------
// The plugin half: run the real Commands.capabilities and print what it would put on the wire.
// ---------------------------------------------------------------------------------------------

/**
 * A JSON encoder for exactly the capability-report shape, defined here rather than in the mock.
 * HttpService does the encoding in Studio; what this has to reproduce is the SHAPE, and keeping it
 * narrow means it cannot quietly accept a report shape the real encoder would mangle.
 */
const EMIT = String.raw`
local function jsonString(value)
    local out = string.gsub(value, "[\\\"]", "\\%0")
    out = string.gsub(out, "\n", "\\n")
    return '"' .. out .. '"'
end
local function emit(label, report)
    assert(type(report) == "table", "capabilities returned no table")
    assert(type(report.operations) == "table", "capabilities returned no operations array")
    local parts = {}
    for _, item in ipairs(report.operations) do
        local entry = '{"op":' .. jsonString(item.op) .. ',"status":' .. jsonString(item.status)
        if item.reason ~= nil then entry = entry .. ',"reason":' .. jsonString(item.reason) end
        table.insert(parts, entry .. "}")
    end
    print(label .. " " .. '{"schema":' .. jsonString(report.schema) .. ',"operations":[' .. table.concat(parts, ",") .. "]}")
end

local function stubRenderer() return { capture = function() return { views = {} } end } end
local function stubGeneration() return { generate = function() return { ok = false } end } end

emit("BUNDLED", Commands.capabilities(Commands.new({ game = game, render = stubRenderer(), generation = stubGeneration() })))
emit("NO_RENDERER", Commands.capabilities(Commands.new({ game = game, generation = stubGeneration() })))
`;

function pluginReports() {
  const dir = mkdtempSync(join(tmpdir(), 'apple-capability-contract-'));
  const file = join(dir, 'capabilities.gen.luau');
  writeFileSync(file, `${PRELUDE}\nlocal Commands = (function()\n${COMMANDS}\nend)()\n${EMIT}`);
  const out = execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' });
  const read = (label) => {
    const line = out.split('\n').find((l) => l.startsWith(`${label} `));
    assert.ok(line, `the plugin printed no ${label} report:\n${out}`);
    return JSON.parse(line.slice(label.length + 1));
  };
  return { bundled: read('BUNDLED'), noRenderer: read('NO_RENDERER') };
}

// ---------------------------------------------------------------------------------------------
// The worker half: its real parser, its real tool registry, its real requirement map.
// ---------------------------------------------------------------------------------------------

const esbuild = join(WORKER, 'node_modules', '.bin', 'esbuild');
const workerBuildable = existsSync(esbuild);

async function workerModules() {
  const dir = mkdtempSync(join(tmpdir(), 'apple-capability-worker-'));
  const bundle = (entry) => {
    const outfile = join(dir, `${entry}.mjs`);
    execFileSync(esbuild, [
      join(WORKER, 'src', `${entry}.ts`),
      '--bundle', '--format=esm', '--target=es2022', `--outfile=${outfile}`,
    ], { cwd: WORKER, stdio: 'pipe' });
    return import(pathToFileURL(outfile).href);
  };
  return { C: await bundle('plugin-capabilities'), T: await bundle('tools') };
}

/**
 * Exactly how SessionDO builds its requirement map — read from the registry, never written out a
 * second time. `assert` that the read found something: a requirements map built from an empty
 * registry would withhold nothing and this whole file would pass while checking nothing.
 */
function studioRequirements(TOOLS) {
  const entries = Object.entries(TOOLS).filter(([, tool]) => tool.studio);
  assert.ok(entries.length > 25, `only ${entries.length} Studio tools — the registry did not load`);
  return {
    candidates: entries.map(([name]) => name),
    requirements: Object.fromEntries(entries.map(([name, tool]) => [name, tool.studioOps ?? []])),
  };
}

const skip = luauMissing ? 'luau is not on PATH' : !workerBuildable ? 'the worker esbuild is not installed' : false;

/**
 * TRIPWIRE, NOT A PROPERTY. Each of these is a capability a paired Studio loses by installing this
 * plugin instead of the legacy one, and each is a named product decision:
 *
 *   run_code       — received text is never compiled or required inside Studio. That refusal is the
 *                    whole reason this plugin can be submitted at all; the removed asset built a
 *                    ModuleScript out of the HTTP body and required it. Twelve tools ride on it.
 *
 * `run_mode` and `inspect_model` LEFT THIS LIST in the Studio-authority pass: both can be expressed
 * as bounded typed operations without evaluating received source. Run mode uses RunService controls
 * behind pairing + edit consent; inspect_model is read-only structural QC. `run_and_check` now uses
 * a typed project_census op rather than depending on run_code for its before/after tripwire.
 *
 * insert_asset LEFT THIS LIST ON 2026-09-19, and this paragraph is the review the comment below
 * demands. It was withheld because "no remote asset loader is reachable from the command bridge",
 * and that refusal cost the product its headline feature: all 81,648 live rows in the asset
 * library are Creator Store CONTAINER assets (59,938 decals, 21,710 meshparts), and measuring in
 * Studio showed there is no loader-free path to place them — MeshId is not writable,
 * AssetService:CreateMeshPartAsync answers "Failed to load mesh asset", and Decal.Texture on a
 * decal id renders blank. So the library delivered nothing at all, to anyone, ever.
 *
 * The ban was aimed at the right danger and hit the wrong target. The prohibited shape is
 * `require`ing a ModuleScript built from an HTTP body — text off the wire becoming running code —
 * and that shape is still forbidden, still pinned below, and still absent. LoadAsset is a
 * first-party service taking an id, with Roblox deciding what comes back.
 *
 * The real risk is that a fetched model CONTAINS scripts, and that is now refused explicitly:
 * handleInsertAsset scans the loaded tree for any LuaSourceContainer BEFORE parenting anything and
 * destroys-and-refuses the whole asset if it finds one. verify-artifact.py REQUIRES that guard in
 * the shipped bytes, which is a stronger invariant than the ban was — "no loader" is satisfied by
 * a plugin that inserts nothing, whereas "no insertion without the code refusal" cannot be
 * satisfied by deleting the guard.
 *
 * If this list changes, a human reviews the change. Do not bump it to match.
 */
const WITHHELD_BY_DESIGN = [
  'run_luau', 'run_spec',
].sort();

/** The visual/layout gate: four tools, all of them standing on the one operation `render_view`. */
const VISUAL_GATE = ['check_composition', 'compose_thumbnail', 'inspect_visually', 'render_view'];

test('the report the plugin emits parses — it never lands in compatibility mode', { skip }, async () => {
  const { C } = await workerModules();
  const { bundled, noRenderer } = pluginReports();
  for (const [label, report] of [['bundled', bundled], ['no-renderer', noRenderer]]) {
    assert.equal(report.schema, C.PLUGIN_CAPABILITY_SCHEMA, `${label}: schema must be the one the worker reads`);
    const parsed = C.parsePluginCapabilities(report);
    assert.ok(parsed, `${label}: the worker REJECTED this plugin's own report, so every tool would silently be offered`);
    // Round-tripping through the canonical DTO is what SessionDO persists, and it must survive.
    assert.ok(C.parsePluginCapabilities(C.normalisePluginCapabilities(report)), `${label}: the persisted form does not parse back`);
  }
});

test('the report covers every live StudioOp, so nothing is left as "unknown"', { skip }, async () => {
  const shared = readFileSync(join(HERE, '..', '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const union = /export type StudioOp =([\s\S]*?);\n\n\/\*\*/m.exec(shared);
  assert.ok(union, 'the StudioOp union must be readable');
  const live = [...new Set([...union[1].matchAll(/op:\s*'([a-z_]+)'/g)].map((m) => m[1]))];
  assert.ok(live.length > 25, `only ${live.length} ops parsed out of the union`);

  const { bundled } = pluginReports();
  const named = new Set(bundled.operations.map((o) => o.op));
  assert.deepEqual(live.filter((op) => !named.has(op)), [], 'an operation the wire allows is not mentioned in the report');
  assert.deepEqual([...named].filter((op) => !live.includes(op)), [], 'the report names an operation the wire no longer has');
  for (const entry of bundled.operations) {
    if (entry.status === 'unsupported') {
      assert.ok(entry.reason && entry.reason.length > 20, `${entry.op} refuses without explaining why`);
    }
  }
});

test('shipping this plugin withholds exactly the reviewed tool list, and nothing more', { skip }, async () => {
  const { C, T } = await workerModules();
  const { candidates, requirements } = studioRequirements(T.TOOLS);
  const { bundled } = pluginReports();

  const filter = C.filterToolsForPlugin(candidates, requirements, bundled);
  assert.equal(filter.capabilitiesKnown, true, 'capability filtering did not apply at all');
  assert.deepEqual(
    [...filter.withheld].sort(),
    WITHHELD_BY_DESIGN,
    'the set of tools a paired Studio loses has changed — review it, do not edit the list to match',
  );
  // A negative, because a filter that withheld everything would satisfy the line above if the list
  // were ever pasted over: the tools the product is actually built on must still be there.
  for (const kept of ['create_instances', 'set_properties', 'edit_script', 'create_checkpoint', 'generate_model', 'get_project_tree']) {
    assert.ok(filter.allowed.has(kept), `${kept} must survive — it is how the agent builds`);
  }
});

test('the visual gate survives when the renderer is bundled, and is withheld by name when it is not', { skip }, async () => {
  const { C, T } = await workerModules();
  const { candidates, requirements } = studioRequirements(T.TOOLS);
  const { bundled, noRenderer } = pluginReports();

  const withRenderer = C.filterToolsForPlugin(candidates, requirements, bundled);
  for (const tool of VISUAL_GATE) {
    assert.ok(withRenderer.allowed.has(tool), `${tool} must be offered when the renderer ships`);
    assert.ok(!withRenderer.withheld.includes(tool), `${tool} must not be withheld when the renderer ships`);
  }

  const without = C.filterToolsForPlugin(candidates, requirements, noRenderer);
  for (const tool of VISUAL_GATE) {
    assert.ok(without.withheld.includes(tool), `${tool} must be withheld when no renderer is bundled`);
  }
  // SessionDO keys its "Rendered appearance was not verified" sentence off this exact membership.
  assert.ok(without.withheld.includes('inspect_visually'), 'the honest-degradation sentence is keyed off this');

  const blocked = without.limitations.find((item) => item.operation === 'render_view');
  assert.ok(blocked, 'the loss must be attributed to render_view, not left as a bare missing tool');
  assert.deepEqual([...blocked.tools].sort(), VISUAL_GATE);

  const note = C.pluginCapabilityPromptNote(without);
  assert.ok(note, 'the model must be told, in the system prompt, that the visual gate is gone');
  assert.match(note, /render_view is unavailable/);
  assert.match(note, /do not claim a withheld operation ran/);
  // The plugin's own sentence is untrusted text and must never reach the system prompt.
  assert.doesNotMatch(note, /not bundled in this build/, 'plugin-authored prose leaked into the model note');
});

test('SessionDO still keys its unverified-appearance sentence off the withheld set', { skip }, async () => {
  // Pinned to the PROPERTY, not the spelling: what must stay true is that the sentence is produced
  // by membership of `inspect_visually` in `withheld`, and that it says the check did not run. If
  // this ever becomes an unconditional line, or stops existing, the plugin's refusal becomes
  // invisible to the person watching — which is the failure this whole file is about.
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const code = session.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  assert.match(code, /withheld\.includes\('inspect_visually'\)/, 'the degradation is no longer driven by the capability report');
  assert.match(code, /Rendered appearance was not verified/, 'the user is no longer told the visual check did not run');
  assert.match(code, /allowed\.has\('inspect_visually'\)/, 'the automatic critique no longer checks whether it may run');
});

/**
 * WHICH PLUGIN IS THE PRODUCT, ASSERTED RATHER THAN REMEMBERED.
 *
 * Two Studio plugins lived in this repository at once and nothing resolved which one shipped. Both
 * looked maintained, the root README pointed at the legacy one, and the worker's own comments cite
 * its files as the thing they must match. A month later that is a fork somebody re-discovers and
 * has to work out from scratch.
 *
 * So the marker is a test, not a note. The legacy tree stays — five suites owned elsewhere read its
 * source, and `apps/worker/src/composition.ts` pins its background constants to that rasteriser —
 * but it may not stop saying what it is.
 */
test('the legacy plugin is marked as not-the-product and names the one that ships', () => {
  const legacy = join(HERE, '..', '..', 'plugin', 'README.md');
  assert.ok(existsSync(legacy), 'apps/plugin/README.md is gone — the fork is unmarked again');
  const text = readFileSync(legacy, 'utf8');
  assert.match(text, /NOT THE PRODUCT/, 'the legacy plugin no longer says it is not the product');
  assert.match(text, /apps\/apple-plugin/, 'the marker must name the plugin that does ship');
  assert.match(text, /docs\/PLUGIN-RELEASE\.md/, 'the marker must point at the release runbook');
});

test('the shipped plugin refuses the pattern the removed Creator Store asset contained', () => {
  // The legacy run_code builds a ModuleScript out of the HTTP body and requires it. That is the
  // prohibited pattern and the reason the decision went the way it did, so both halves are pinned:
  // the legacy one still HAS it (if it ever loses it, the reasoning here needs rewriting), and the
  // shipped one must never grow it.
  const legacyOps = readFileSync(join(HERE, '..', '..', 'plugin', 'src', 'Ops.luau'), 'utf8');
  assert.match(legacyOps, /pcall\(require, module\)/, 'the legacy run_code no longer loads received text — revisit apps/plugin/README.md');

  // CALL SITES, not mentions. Commands.luau carries a refusal LIST naming loadstring, InsertService
  // and GetObjects, and a scanner that matched the words would report the guard as the defect —
  // the better the refusal is documented, the more false findings a prose-reading scan produces.
  const CALLS = [
    /\bloadstring\s*\(/,
    /pcall\s*\(\s*require\s*,/,
    /:\s*GetObjects\s*\(/,
    // InsertService left this list with insert_asset — see the review above. GetObjects stays:
    // it takes a URL and is the shape that fetches arbitrary content, where LoadAsset takes an id
    // that Roblox resolves. The two are not the same call wearing different names.
    /\bCreateAssetAsync\s*\(/,
    /rbxassetid:\/\//,
  ];
  for (const name of ['Commands.luau', 'Bridge.luau', 'GenerationService.luau', 'init.server.luau', 'Render.luau']) {
    const raw = readFileSync(join(HERE, '..', 'src', name), 'utf8');
    const src = raw.replace(/--\[\[[\s\S]*?\]\]/g, ' ').replace(/--[^\n]*/g, ' ');
    assert.ok(src.length > 200, `${name}: comment stripping ate the source — this test would check nothing`);
    for (const forbidden of CALLS) {
      assert.doesNotMatch(src, forbidden, `${name} calls ${forbidden}, which is the shape that got the previous asset removed`);
    }
  }
  // Prove the scan can fire, here, rather than trusting six negatives that have never matched.
  for (const forbidden of CALLS) {
    const planted = `local x = 1\nloadstring("x")\npcall(require, module)\nthing:GetObjects(1)\ngame:GetService("InsertService")\nservice:CreateAssetAsync(m)\nlocal id = "rbxassetid://1"\n`;
    assert.match(planted, forbidden, `the scan for ${forbidden} cannot match anything and checks nothing`);
  }
  // And the refusal list the agent's own generated source is held to is still there.
  const commands = readFileSync(join(HERE, '..', 'src', 'Commands.luau'), 'utf8');
  assert.match(commands, /"loadstring", "dynamic source compilation"/, 'the written-source refusal list is gone');
});
