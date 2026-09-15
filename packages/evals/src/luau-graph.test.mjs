// Proof that the call graph and the dependency graph describe the real edges, and that where they
// cannot know an edge they say so instead of inventing one.
//
// An invented edge is the dangerous direction for both graphs. In the call graph it makes the
// transitive yield set WIDER than the truth, which turns a genuine watchdog hang into "that loop
// yields, nothing to see". In the dependency graph it manufactures a require cycle that is not
// there. So `unresolved` is asserted alongside `edges` throughout: a silent resolution failure and
// a correct resolution look identical if you only count edges.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCallGraph, unreachableFunctions, findCycles,
  buildDependencyGraph, requireCycleFindings, requireOrder, indexPlace, searchPlace,
} from './luau-graph.mjs';

const named = (graph, name) => graph.nodes.find((n) => n.name === name);

// ------------------------------------------------------------------ call graph

test('edges follow real call sites, including `self:` inside a method', () => {
  const g = buildCallGraph(`local M = {}
local function helper() return 1 end
function M.Other() return helper() end
function M:Start()
	self:Other()
end
return M
`);
  assert.equal(g.errors.length, 0);
  const start = named(g, 'M.Start');
  assert.deepEqual(start.callees, [named(g, 'M.Other').id], '`self:Other()` binds to M.Other');
  assert.deepEqual(named(g, 'M.Other').callees, [named(g, 'helper').id]);
});

test('a call this analysis cannot resolve is listed as unresolved, not dropped', () => {
  const g = buildCallGraph('local Module = require(script.Other)\nModule.Run()\nos.clock()\n');
  assert.deepEqual(g.edges, []);
  assert.deepEqual(g.unresolved.map((u) => u.name).sort(), ['Module.Run', 'os.clock', 'require']);
});

test('yielding propagates transitively through the call graph, and stops where it should', () => {
  const g = buildCallGraph(`local function fetch(k)
	return game:GetService("DataStoreService"):GetDataStore("d"):GetAsync(k)
end
local function load() return fetch("x") end
local function pure() return 1 + 1 end
return { load = load, pure = pure }
`);
  assert.equal(named(g, 'fetch').yieldsDirectly, true);
  assert.equal(named(g, 'load').yieldsDirectly, false);
  assert.equal(named(g, 'load').yields, true, 'load yields because fetch does');
  assert.equal(named(g, 'pure').yields, false, 'nothing pure calls yields');
  assert.deepEqual([...g.yieldingFunctions].sort(), ['fetch', 'load']);
});

test('an unreachable local function is reported and an externally reachable one is not', () => {
  const g = buildCallGraph(`local M = {}
local function used() return 1 end
local function orphan() return 2 end
function M.Start() return used() end
return M
`);
  assert.deepEqual(
    unreachableFunctions(g).map((f) => [f.line, f.detail.includes('orphan')]),
    [[3, true]],
    'only `orphan` is dead: `used` is called by M.Start, which another script can call',
  );
});

test('a local function passed as a value is never called dead', () => {
  // `Connect(onAdded)` is not a call to `onAdded`, so a pure call-graph reachability pass would
  // report every event handler in Roblox as dead code.
  const g = buildCallGraph('local function onAdded(p) print(p) end\ngame:GetService("Players").PlayerAdded:Connect(onAdded)\n');
  assert.deepEqual(unreachableFunctions(g), []);
  assert.ok(g.escaped.has('onAdded'));
});

test('escaped names do not include declarations, or nothing could ever be reported', () => {
  // The first version of `escapedNames` counted a function's own declaration as an escape, so the
  // filter excluded everything and `unreachableFunctions` was structurally incapable of a finding.
  const g = buildCallGraph('local function orphan() return 1 end\nreturn 2\n');
  assert.equal(g.escaped.has('orphan'), false);
  assert.equal(unreachableFunctions(g).length, 1);
});

test('findCycles reports each cycle once regardless of where it is entered', () => {
  const cycles = findCycles(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]);
  assert.equal(cycles.length, 1);
  assert.deepEqual([...cycles[0]].sort(), ['a', 'b', 'c']);
  assert.deepEqual(findCycles(['a', 'b'], [['a', 'b']]), []);
});

// ------------------------------------------------------------------ dependency graph

const PLACE = [
  {
    path: 'ServerScriptService/Main',
    source: 'local RS = game:GetService("ReplicatedStorage")\nlocal Shop = require(RS.Modules.Shop)\nShop.Start()\n',
  },
  {
    path: 'ReplicatedStorage/Modules/Shop',
    source: 'local Economy = require(script.Parent.Economy)\nreturn { Start = function() return Economy.Init() end }\n',
  },
  {
    path: 'ReplicatedStorage/Modules/Economy',
    source: 'local Util = require(script.Parent:WaitForChild("Util"))\nreturn { Init = function() return Util.Round(1) end }\n',
  },
  { path: 'ReplicatedStorage/Modules/Util', source: 'return { Round = function(n) return n end }\n' },
  { path: 'ReplicatedStorage/Modules/Orphan', source: 'return {}\n' },
];

test('requires resolve through GetService aliases, `script.Parent`, and WaitForChild', () => {
  const g = buildDependencyGraph(PLACE);
  assert.deepEqual(g.edges.map((e) => `${e.from} -> ${e.to}`), [
    'ServerScriptService/Main -> ReplicatedStorage/Modules/Shop',
    'ReplicatedStorage/Modules/Shop -> ReplicatedStorage/Modules/Economy',
    'ReplicatedStorage/Modules/Economy -> ReplicatedStorage/Modules/Util',
  ]);
  assert.deepEqual(g.unresolved, [], 'every require in this place is statically decidable');
  assert.deepEqual(g.cycles, []);
});

test('a require that cannot be resolved is reported rather than silently skipped', () => {
  const g = buildDependencyGraph([
    { path: 'ServerScriptService/Main', source: 'local name = pick()\nlocal M = require(script.Parent[name])\nreturn M\n' },
  ]);
  assert.deepEqual(g.edges, []);
  assert.equal(g.unresolved.length, 1);
  assert.equal(g.unresolved[0].line, 2);
  assert.match(g.unresolved[0].expression, /script\.Parent\[name\]/);
});

test('a require cycle is found and named', () => {
  const cyclic = [
    { path: 'A/Shop', source: 'local E = require(script.Parent.Economy)\nreturn { E = E }\n' },
    { path: 'A/Economy', source: 'local S = require(script.Parent.Shop)\nreturn { S = S }\n' },
  ];
  const g = buildDependencyGraph(cyclic);
  const findings = requireCycleFindings(g);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'require-cycle');
  assert.match(findings[0].detail, /A\/Shop -> A\/Economy -> A\/Shop|A\/Economy -> A\/Shop -> A\/Economy/);
  assert.equal(requireOrder(g), null, 'a cyclic graph has no load order');
});

test('an acyclic place has a load order with every dependency before its dependents', () => {
  const g = buildDependencyGraph(PLACE);
  const order = requireOrder(g);
  assert.ok(order, 'the sample place is acyclic');
  assert.equal(order.length, PLACE.length);
  for (const e of g.edges) {
    assert.ok(
      order.indexOf(e.to) < order.indexOf(e.from),
      `${e.to} must load before ${e.from}`,
    );
  }
});

test('roots and leaves name the entry points and the orphans', () => {
  const g = buildDependencyGraph(PLACE);
  assert.deepEqual(g.roots.sort(), ['ReplicatedStorage/Modules/Orphan', 'ServerScriptService/Main']);
  assert.ok(g.leaves.includes('ReplicatedStorage/Modules/Util'));
});

// ------------------------------------------------------------------ place-wide search

test('indexPlace finds declarations including a module table written as a return literal', () => {
  const index = indexPlace(PLACE);
  const util = index.filter((s) => s.path === 'ReplicatedStorage/Modules/Util');
  assert.deepEqual(util.map((s) => [s.name, s.kind]), [['Round', 'field']]);
  assert.ok(index.some((s) => s.path === 'ServerScriptService/Main') === false, 'Main declares no functions');
});

test('searchPlace returns file, line and the matching text', () => {
  const hits = searchPlace(PLACE, 'GetService');
  assert.deepEqual(hits.map((h) => [h.path, h.line]), [['ServerScriptService/Main', 1]]);
  assert.match(hits[0].text, /ReplicatedStorage/);

  const regexHits = searchPlace(PLACE, 'require\\(script\\.Parent', { regex: true });
  assert.deepEqual(regexHits.map((h) => h.path), ['ReplicatedStorage/Modules/Shop', 'ReplicatedStorage/Modules/Economy']);
});
