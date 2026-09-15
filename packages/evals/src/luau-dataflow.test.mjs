// Proof that values are followed, and that they are not followed further than the evidence goes.
//
// Taint analysis is the check most likely to be written so it can never fail: report every remote
// parameter that appears anywhere near a `.Value` and you get a rule that "catches" the exploit and
// also fires on every correct shop in the corpus, which means nobody reads it. So the tests below
// pin BOTH edges — the flow through intermediate locals that must be found, and the untainted
// neighbour one line away that must not be.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveInstanceExpression, instanceEnvironment, requireTargets, taintFlows, taintFindings,
} from './luau-dataflow.mjs';
import { parseLuau } from './luau-ast.mjs';

// ------------------------------------------------------------------ constant propagation

test('an instance path is followed through a chain of locals', () => {
  const src = `local RS = game:GetService("ReplicatedStorage")
local Modules = RS.Modules
local Deep = Modules.Shop
`;
  const env = instanceEnvironment(src, { selfPath: 'ServerScriptService/Main' });
  assert.equal(env.get('RS'), 'ReplicatedStorage');
  assert.equal(env.get('Modules'), 'ReplicatedStorage/Modules');
  assert.equal(env.get('Deep'), 'ReplicatedStorage/Modules/Shop');
});

test('`script` and `script.Parent` resolve relative to the file being analysed', () => {
  const env = new Map();
  const expr = (src) => parseLuau(`local v = ${src}\n`).ast.body[0].init[0];
  const self = 'ReplicatedStorage/Modules/Shop';
  assert.equal(resolveInstanceExpression(expr('script'), env, self), self);
  assert.equal(resolveInstanceExpression(expr('script.Parent'), env, self), 'ReplicatedStorage/Modules');
  assert.equal(resolveInstanceExpression(expr('script.Parent.Parent'), env, self), 'ReplicatedStorage');
  assert.equal(resolveInstanceExpression(expr('script.Child'), env, self), `${self}/Child`);
  assert.equal(resolveInstanceExpression(expr('workspace.Map'), env, self), 'Workspace/Map');
});

test('an undecidable path resolves to null instead of a guess', () => {
  const env = new Map([['Modules', 'ReplicatedStorage/Modules']]);
  const expr = (src) => parseLuau(`local v = ${src}\n`).ast.body[0].init[0];
  assert.equal(resolveInstanceExpression(expr('Modules[name]'), env, null), null);
  assert.equal(resolveInstanceExpression(expr('pick().Thing'), env, null), null);
  assert.equal(resolveInstanceExpression(expr('Unknown.Thing'), env, null), null);
  assert.equal(resolveInstanceExpression(expr('Modules["Shop"]'), env, null), 'ReplicatedStorage/Modules/Shop',
    'a string index IS decidable');
});

test('a name reassigned to something undecidable stops being decidable', () => {
  const env = instanceEnvironment('local M = game:GetService("Players")\nM = pick()\n');
  assert.equal(env.has('M'), false, 'a stale binding would resolve later requires to the wrong script');
});

test('requireTargets reports the resolved path and the source text that produced it', () => {
  const targets = requireTargets(
    'local RS = game:GetService("ReplicatedStorage")\nlocal A = require(RS.Modules.A)\nlocal B = require(RS.Modules[key])\n',
    { selfPath: 'ServerScriptService/Main' },
  );
  assert.deepEqual(targets.map((t) => [t.line, t.path]), [[2, 'ReplicatedStorage/Modules/A'], [3, null]]);
  assert.equal(targets[1].expression, 'RS.Modules[key]');
});

// ------------------------------------------------------------------ taint

const HANDLER = (body) => `local Remote = game:GetService("ReplicatedStorage"):WaitForChild("Buy")
Remote.OnServerEvent:Connect(function(player, id, amount)
${body}
end)
`;

test('a remote argument is followed through intermediate locals to the sink', () => {
  const flows = taintFlows(HANDLER('\tlocal qty = amount\n\tlocal total = qty * 2\n\tplayer.leaderstats.Coins.Value += total'));
  assert.equal(flows.length, 1);
  assert.equal(flows[0].origin, 'amount');
  assert.equal(flows[0].hops, 2, 'amount -> qty -> total is two assignments');
  assert.equal(flows[0].line, 5);
});

test('the FIRST parameter of OnServerEvent is the Player and is not attacker-controlled', () => {
  // Roblox supplies it; treating it as tainted would fire on every correct handler in existence.
  const flows = taintFlows(HANDLER('\tlocal who = player\n\tworkspace.Sign.Value = who'));
  assert.deepEqual(flows, []);
});

test('a value that never came from the remote is not tainted', () => {
  const flows = taintFlows(HANDLER('\tlocal price = 10\n\tplayer.leaderstats.Coins.Value -= price'));
  assert.deepEqual(flows, []);
});

test('the sinks that matter are each reached', () => {
  const cases = {
    'loadstring': '\tlocal code = id\n\tloadstring(code)',
    'DataStore write': '\tlocal v = amount\n\tstore:SetAsync("k", v)',
    'broadcast to all clients': '\tlocal msg = id\n\tRemote:FireAllClients(msg)',
    'external request': '\tlocal body = id\n\thttp:PostAsync("https://x", body)',
  };
  for (const [what, body] of Object.entries(cases)) {
    const flows = taintFlows(HANDLER(body));
    assert.equal(flows.length, 1, `no flow found for ${what}`);
    assert.equal(flows[0].hops, 1);
  }
});

test('OnServerInvoke is a remote handler too', () => {
  const flows = taintFlows(`local F = game:GetService("ReplicatedStorage"):WaitForChild("Ask")
F.OnServerInvoke = function(player, amount)
	local n = amount
	player.leaderstats.Coins.Value = n
	return true
end
`);
  assert.equal(flows.length, 1);
  assert.equal(flows[0].handlerKind, 'OnServerInvoke');
});

test('taintFindings reports the indirect flow and leaves the direct one to the scanner', () => {
  // `roblox-antipatterns.mjs`'s `server-trusts-client-amount` already reports the zero-hop shape.
  // Reporting it here as well would show one bug twice; missing the one-hop shape would be the
  // scanner's blind spot going unreported. Both halves are asserted.
  const direct = HANDLER('\tplayer.leaderstats.Coins.Value += amount');
  const indirect = HANDLER('\tlocal qty = amount\n\tplayer.leaderstats.Coins.Value += qty');

  assert.equal(taintFlows(direct).length, 1, 'the direct flow is still FOUND');
  assert.equal(taintFlows(direct)[0].hops, 0);
  assert.deepEqual(taintFindings(direct), [], 'and is deliberately not REPORTED here');

  const reported = taintFindings(indirect);
  assert.equal(reported.length, 1);
  assert.equal(reported[0].rule, 'remote-taint-reaches-sink');
  assert.equal(reported[0].severity, 'error');
  assert.match(reported[0].detail, /`amount`.*1 assignment/);

  assert.equal(taintFindings(direct, { minHops: 0 }).length, 1, 'minHops is an option, not a hard-coded blind spot');
});

test('a handler with no extra parameters produces no flows', () => {
  const flows = taintFlows(`local Remote = game:GetService("ReplicatedStorage"):WaitForChild("Ping")
Remote.OnServerEvent:Connect(function(player)
	player.leaderstats.Coins.Value += 1
end)
`);
  assert.deepEqual(flows, []);
});
