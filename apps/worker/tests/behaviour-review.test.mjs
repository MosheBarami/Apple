/**
 * behaviour-review: the lint backstop for scripts the agent writes (edit_script). One rule is enforced (a loop that never
 * yields); the rest are reported. Every script below is invented for the test; none is about a particular subject.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { fakeStudio, coverModel } from './behaviour-fixtures.mjs';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = mkdtempSync(join(tmpdir(), 'behaviour-review-'));
function bundle(src, name) {
  const outfile = join(tmp, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', src), '--bundle', '--format=esm', '--target=es2022', '--platform=node', `--outfile=${outfile}`, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
  return import(`file://${outfile}`);
}
const R = await bundle('behaviour-review.ts', 'review');
const A = await bundle('model-anatomy.ts', 'anatomy');
const L = await bundle('luau-review.ts', 'luau');
const T = await bundle('tools.ts', 'tools');

const PATH = 'game.Workspace.Unit.Script';
const lint = (source, extra = {}, tree = null) => R.lintBehaviourScript({ path: PATH, className: 'Script', source, ...extra }, tree);
const rules = (findings) => findings.map((f) => f.rule);
const treeOf = (root) => A.parseTree(JSON.parse(JSON.stringify({ root, nodeCount: 1, truncated: false })));

// ------------------------------------------------------------------------------------------------ the enforced rule

test('a loop that never yields is an enforced error, in each shape it takes, and a yield or an event clears it', () => {
  const frozen = [
    'local p = script.Parent\nwhile true do\n  p.Position = p.Position + Vector3.new(0, 1, 0)\nend',
    'local n = 0\nrepeat\n  n += 1\nuntil false',
    'while true do\n  local x = 1\nend',
  ];
  for (const src of frozen) {
    const f = lint(src).find((x) => x.rule === 'unyielding-loop');
    assert.ok(f, `not found in: ${src}`);
    assert.equal(f.enforced, true);
    assert.equal(f.severity, 'error');
    assert.match(f.why, /watchdog.*task\.wait\(\).*Heartbeat/);
  }
  const fine = [
    'while true do\n  task.wait(1)\nend',
    'while true do\n  game:GetService("RunService").Heartbeat:Wait()\nend',
    'game:GetService("RunService").Heartbeat:Connect(function() end)',
    'for i = 1, 10 do\n  local x = i\nend',
  ];
  for (const src of fine) assert.ok(!rules(lint(src)).includes('unyielding-loop'), `flagged: ${src}`);
});

// ------------------------------------------------------------------------------------------------ references

test('a WaitForChild on a name the tree does not have is an error that says what the tree has', () => {
  const tree = treeOf(coverModel().root);
  const f = lint('local m = script.Parent\nlocal lid = m:WaitForChild("Lid")\nprint(lid)', {}, tree).find((x) => x.rule === 'reference-missing');
  assert.ok(f);
  assert.equal(f.severity, 'error');
  assert.equal(f.enforced, false, 'reported, not refused: a child may be created at runtime');
  assert.equal(f.line, 2);
  assert.match(f.detail, /WaitForChild\("Lid"\) on game\.Workspace\.Unit.*no child named "Lid" \(it has: Body, Cover, Knob\)/);
  assert.match(f.why, /yields forever.*stops at that line/);
});

test('references that exist, carry a timeout, or are nil-safe are not flagged', () => {
  const tree = treeOf(coverModel().root);
  const ok = [
    'local m = script.Parent\nlocal c = m:WaitForChild("Cover")',
    'local c = script.Parent:WaitForChild("Missing", 5)',
    'local c = script.Parent:FindFirstChild("Missing")',
    'local c = script.Parent:WaitForChild("Cover")\nlocal k = c:FindFirstChild("Hold")',
    'local name = "Anything"\nlocal c = script.Parent:WaitForChild(name)',
    'local up = script.Parent.Parent\nlocal c = up:WaitForChild("Elsewhere")',
  ];
  for (const src of ok) assert.ok(!rules(lint(src, {}, tree)).includes('reference-missing'), `flagged: ${src}`);
});

test('chains and aliases are followed; a name that is reassigned or shadowed is left alone', () => {
  const tree = treeOf(coverModel().root);
  const chain = lint('local c = script.Parent:WaitForChild("Cover")\nlocal h = c:WaitForChild("Latch")', {}, tree);
  assert.deepEqual(rules(chain), ['reference-missing']);
  assert.match(chain[0].detail, /game\.Workspace\.Unit\.Cover.*"Latch".*it has: Hold/);
  assert.deepEqual(rules(lint('local m = script.Parent\nlocal c = m:WaitForChild("Cover"):WaitForChild("Latch")', {}, tree)), ['reference-missing'], 'a chained call');
  assert.deepEqual(rules(lint('local m = script.Parent\nm = workspace\nlocal c = m:WaitForChild("Lid")', {}, tree)), [], 'reassigned');
  assert.deepEqual(rules(lint('local m = script.Parent\nlocal function f(m)\n  return m:WaitForChild("Lid")\nend', {}, tree)), [], 'shadowed by a parameter');
});

test('without a tree the check does nothing, and says nothing it did not look at', () => {
  assert.deepEqual(rules(lint('local c = script.Parent:WaitForChild("Lid")')), []);
});

// ------------------------------------------------------------------------------------------------ the other rules

test('a Touched handler that does something with no debounce is flagged; every shape of guard clears it', () => {
  const flagged = lint('local s = script.Parent.Sound\nscript.Parent.Touched:Connect(function(hit)\n  s:Play()\nend)');
  assert.ok(rules(flagged).includes('touched-without-guard'));
  assert.equal(flagged.find((x) => x.rule === 'touched-without-guard').line, 2);
  const guarded = [
    'local busy = false\nscript.Parent.Touched:Connect(function(hit)\n  if busy then return end\n  busy = true\n  script.Parent.Sound:Play()\n  task.wait(1)\n  busy = false\nend)',
    'local last = 0\nscript.Parent.Touched:Connect(function(hit)\n  if os.clock() - last < 1 then return end\n  last = os.clock()\n  script.Parent.Sound:Play()\nend)',
    'local cool = {}\nscript.Parent.Touched:Connect(function(hit)\n  local p = hit.Parent\n  if cool[p] then return end\n  cool[p] = true\n  script.Parent.Sound:Play()\nend)',
    'local conn\nconn = script.Parent.Touched:Connect(function(hit)\n  conn:Disconnect()\n  script.Parent.Sound:Play()\nend)',
    'script.Parent.Touched:Connect(function(hit)\n  print(hit.Name)\nend)',
  ];
  for (const src of guarded) assert.ok(!rules(lint(src)).includes('touched-without-guard'), `flagged: ${src}`);
  assert.ok(rules(lint('script.Parent.Touched:Connect(function(hit)\n  script.Parent.Transparency = 0.5\nend)')).includes('touched-without-guard'), 'a property change counts as doing something');
});

test('connecting inside a while or repeat loop is flagged; once per item in a for, or inside a function, is not', () => {
  const bad = lint('while true do\n  task.wait(1)\n  script.Parent.Touched:Connect(function() end)\nend');
  assert.deepEqual(rules(bad), ['connect-in-loop']);
  assert.ok(rules(lint('repeat\n  task.wait()\n  script.Parent.Changed:Connect(function() end)\nuntil done')).includes('connect-in-loop'));
  assert.deepEqual(rules(lint('for _, p in script.Parent:GetChildren() do\n  p.Touched:Connect(function() end)\nend')), []);
  assert.deepEqual(rules(lint('while true do\n  task.wait(1)\n  local function wire()\n    script.Parent.Touched:Connect(function() end)\n  end\nend')), []);
});

test('ingress and egress primitives are reported, with the owner-decision note, and an asset id literal alone is not', () => {
  const f = lint('print("x")', { ingress: [{ code: 'get_objects', why: 'game:GetObjects loads an arbitrary asset id' }, { code: 'asset_uri', why: 'a literal' }] });
  assert.deepEqual(rules(f), ['asset-ingress'], 'asset_uri is ordinary');
  assert.match(f[0].why, /still admitted \(owner decision pending\)/);
  assert.equal(f[0].enforced, false);
  const net = lint('local H = game:GetService("HttpService")\nlocal r = H:GetAsync("https://example.com")');
  assert.ok(rules(net).includes('network-egress'));
});

test('a script that ties a trigger to an effect add_behaviour has a verb for gets a pointer, never a refusal', () => {
  const src = 'local pad = script.Parent\npad.Touched:Connect(function(hit)\n  pad.Transparency = 0.5\n  pad.Sound:Play()\nend)';
  const f = lint(src).find((x) => x.rule === 'hand-rolled-verb');
  assert.ok(f);
  assert.equal(f.severity, 'info');
  assert.equal(f.enforced, false);
  assert.match(f.detail, /fade, sound/);
  assert.ok(!rules(R.lintBehaviourScript({ path: 'game.ServerScriptService.Game', className: 'Script', source: src })).includes('hand-rolled-verb'), 'only for scripts that live in a model');
  assert.ok(!rules(lint('local x = 1\nprint(x)')).includes('hand-rolled-verb'));
  assert.ok(!rules(lint('local t = game:GetService("TweenService")\nlocal n = 1')).includes('hand-rolled-verb'), 'no trigger, no pointer');
});

test('the behaviours file says it is written by add_behaviour', () => {
  const f = R.lintBehaviourScript({ path: 'game.Workspace.Unit.AppleBehaviours', className: 'ModuleScript', source: 'return {}' });
  assert.deepEqual(rules(f), ['behaviours-file']);
});

test('a script that does not parse yields no findings (the syntax gate speaks for it)', () => {
  assert.deepEqual(lint('while true do'), []);
});

test('findings come errors first, then by line', () => {
  const tree = treeOf(coverModel().root);
  const src = 'script.Parent.Touched:Connect(function(h)\n  script.Parent.Sound:Play()\nend)\nlocal c = script.Parent:WaitForChild("Lid")\nwhile true do\n  local y = 1\nend';
  const f = lint(src, {}, tree);
  assert.deepEqual(f.map((x) => x.severity), [...f.map((x) => x.severity)].sort((a, b) => ({ error: 0, warn: 1, info: 2 })[a] - ({ error: 0, warn: 1, info: 2 })[b]));
  assert.ok(f.filter((x) => x.severity === 'error').length >= 2);
});

// ------------------------------------------------------------------------------------------------ the write path

function ctxFor(root, extra = {}) {
  const studio = fakeStudio(root, { hash: L.sourceHash });
  return Object.assign(studio, extra);
}

test('lintScriptWrite: reads the tree only when a reference needs it, and a refusal carries the fix', async () => {
  const m = coverModel();
  const studio = ctxFor(m.root);
  const none = await R.lintScriptWrite(studio, { path: PATH, className: 'Script', source: 'print(1)', parentPath: 'game.Workspace.Unit' });
  assert.deepEqual(none, {}, 'nothing to say, nothing returned');
  assert.equal(studio.ops.length, 0, 'no tree read when no reference needs checking');

  const miss = await R.lintScriptWrite(studio, { path: PATH, className: 'Script', source: 'local c = script.Parent:WaitForChild("Lid")', parentPath: 'game.Workspace.Unit' });
  assert.deepEqual(studio.ops.map((o) => o.op), ['get_tree']);
  assert.equal(miss.refusal, undefined);
  assert.equal(miss.summary.references, 'checked against the tree in the place now');
  assert.match(miss.summary.findings[0], /line 1: reference-missing — .*"Lid"/);

  const loop = await R.lintScriptWrite(studio, { path: PATH, className: 'Script', source: 'while true do\n  local x = 1\nend' });
  assert.match(loop.refusal.error, /^refused: this script would freeze the server — line 1: unyielding-loop.*task\.wait\(\).*Nothing was written, game\.Workspace\.Unit\.Script is unchanged\./);
  assert.ok(loop.refusal.lint.length >= 1);
});

test('lintScriptWrite: a tree it could not read is "unchecked" with the reason, never a clean bill', async () => {
  const src = 'local c = script.Parent:WaitForChild("Lid")';
  const failing = { execStudioOp: async () => ({ ok: false, error: 'no plugin' }) };
  const a = await R.lintScriptWrite(failing, { path: PATH, className: 'Script', source: src, parentPath: 'game.Workspace.Unit' });
  assert.match(a.summary.references, /^unchecked \(no plugin\)/);
  assert.deepEqual(a.summary.findings, []);
  const throwing = { execStudioOp: async () => { throw new Error('socket closed'); } };
  assert.match((await R.lintScriptWrite(throwing, { path: PATH, className: 'Script', source: src, parentPath: 'game.Workspace.Unit' })).summary.references, /unchecked \(socket closed\)/);
  const studio = ctxFor(coverModel().root);
  studio.truncated = true;
  assert.match((await R.lintScriptWrite(studio, { path: PATH, className: 'Script', source: src, parentPath: 'game.Workspace.Unit' })).summary.references, /unchecked \(the tree around the script is too large/);
  assert.match((await R.lintScriptWrite(failing, { path: 'oops', className: 'Script', source: src })).summary.references, /unchecked \(the script's parent could not be worked out\)/);
});

test('lintScriptWrite: the kill switch turns the lint and the refusal off, and a non-script is left alone', async () => {
  const studio = ctxFor(coverModel().root, { env: { BEHAVIOUR_V2: 'off' } });
  assert.deepEqual(await R.lintScriptWrite(studio, { path: PATH, className: 'Script', source: 'while true do\n  local x = 1\nend' }), {});
  assert.deepEqual(await R.lintScriptWrite(ctxFor(coverModel().root), { path: 'game.Workspace.Unit.Hum', className: 'Sound', source: 'while true do end' }), {});
});

test('lintScriptWrite: at most six findings ride on the result', async () => {
  const body = Array.from({ length: 10 }, (_, i) => `script.Parent.Part${i}.Touched:Connect(function(h)\n  script.Parent.Sound:Play()\nend)`).join('\n');
  const r = await R.lintScriptWrite({ execStudioOp: async () => ({ ok: false }) }, { path: PATH, className: 'Script', source: body });
  assert.equal(r.summary.findings.length, 6);
});

// ------------------------------------------------------------------------------------------------ in edit_script

const edit = (studio, args) => T.runTool(studio, 'edit_script', JSON.stringify(args));
const unitScript = (source, extra = {}) => ({ path: PATH, source, create_class: 'Script', create_parent: 'game.Workspace.Unit', ...extra });

test('edit_script: a loop that never yields is refused before anything is written', async () => {
  const studio = ctxFor(coverModel().root);
  const r = await edit(studio, unitScript('while true do\n  local x = 1\nend'));
  assert.equal(r.ok, false);
  assert.match(r.resultForLlm, /refused: this script would freeze the server/);
  assert.ok(!studio.ops.some((o) => o.op === 'edit_script'), 'no write was sent');
  assert.equal(studio.scripts.size, 0);
});

test('edit_script: a script that waits for a child the model does not have is written, and told so, with how far the check got', async () => {
  const studio = ctxFor(coverModel().root);
  const r = await edit(studio, unitScript('local lid = script.Parent:WaitForChild("Lid")\nprint(lid)'));
  assert.equal(r.ok, true, r.resultForLlm);
  const out = JSON.parse(r.resultForLlm);
  assert.equal(out.lint.references, 'checked against the tree in the place now');
  assert.match(out.lint.findings[0], /reference-missing.*"Lid".*it has: Body, Cover, Knob/);
  assert.equal(studio.scripts.size, 1, 'it was written: the finding informs, it does not refuse');
});

test('edit_script: a clean script carries no lint field at all', async () => {
  const studio = ctxFor(coverModel().root);
  const r = await edit(studio, unitScript('print("ready")'));
  assert.equal(r.ok, true, r.resultForLlm);
  assert.equal('lint' in JSON.parse(r.resultForLlm), false);
});

test('edit_script: an existing script is edited with the class it already has, and the lint still runs', async () => {
  const studio = ctxFor(coverModel().root);
  studio.scripts.set(PATH, 'print("v1")\n');
  const realExec = studio.execStudioOp;
  studio.execStudioOp = async (op) => {
    const r = await realExec(op);
    return op.op === 'read_script' && r.ok ? { ...r, data: { ...r.data, class: 'Script' } } : r;
  };
  const r = await edit(studio, { path: PATH, edits: [{ find: 'print("v1")', replace: 'while true do\n  local x = 1\nend' }] });
  assert.equal(r.ok, false);
  assert.match(r.resultForLlm, /freeze the server/);
  assert.equal(studio.scripts.get(PATH), 'print("v1")\n', 'unchanged');
});

test('edit_script: the kill switch leaves the old behaviour exactly', async () => {
  const studio = ctxFor(coverModel().root, { env: { BEHAVIOUR_V2: 'off' } });
  const r = await edit(studio, unitScript('while true do\n  local x = 1\nend'));
  assert.equal(r.ok, true, r.resultForLlm);
  assert.equal('lint' in JSON.parse(r.resultForLlm), false);
});
