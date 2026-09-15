/**
 * THE CODE-INTELLIGENCE CLUSTER, MEASURED AT THE PRODUCT SEAM.
 *
 * packages/evals/src has had a Luau parser, a scope-correct symbol table, a CFG, a require graph
 * and the Roblox semantic rules for a long time, all tested — and no file under apps/ imported any
 * of it. The eval harness could tell you a model wrote a client-invoked RemoteFunction; the agent
 * that actually writes scripts into a user's place could not. apps/worker/src/luau-review.ts is
 * the seam, and this suite is about the seam, not about the engine behind it (that engine has its
 * own suites in packages/evals).
 *
 * WHAT IS ASSERTED, AND WHY IN THIS SHAPE:
 *
 *   1. EVERY GUARD IS FED A REAL VIOLATION. A body that does not parse, an edit whose anchor is
 *      gone, a base hash that no longer matches, a LocalScript in ServerScriptService, a require
 *      cycle. Each negative fixture breaks EXACTLY ONE thing and is paired with a control that
 *      differs in exactly that one respect (F-66) — otherwise "it refused" proves only that
 *      something was wrong, not that the rule under test is the thing that caught it.
 *
 *   2. THE REFUSAL IS OBSERVED AT THE PLUGIN BOUNDARY, NOT IN THE RETURN VALUE. A tool that says
 *      "nothing was written" and then writes is the failure mode that matters, so every refusal
 *      test asserts that no `edit_script` op reached the stub. The stub records every op.
 *
 *   3. THE TWO HASH IMPLEMENTATIONS ARE RUN AGAINST EACH OTHER. `sourceHash` in the worker and
 *      `sourceHash` in Ops.luau are two loops in two languages whose only contract is that they
 *      agree; asserting that in prose is worth nothing. The Luau function is EXTRACTED from
 *      Ops.luau and EXECUTED by the real `luau` interpreter over the same vectors. If the binary
 *      is missing the test fails rather than skipping — a hash agreement nobody checked is the
 *      thing that silently refuses every edit on the first file containing an em-dash.
 *
 *   4. THE DIFF IS CHECKED BY RECONSTRUCTION, NOT BY SPELLING. `+3 / -1` is a fact about the
 *      renderer. "the `ctx`+`add` lines of the hunks, in order, are exactly the changed region of
 *      the after-file" is the claim a diff makes.
 *
 * Run with:  node --test tests/luau-review.test.mjs        (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  applyEdits,
  checkSyntax,
  contextFindings,
  diffHunks,
  diffStat,
  formatScript,
  graphPath,
  reviewPlace,
  reviewScript,
  sourceHash,
  symbolLookup,
  symbolSearch,
} from '../src/luau-review.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'luau-review-'));

const bundle = join(TMP, 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + bundle],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${bundle}`);

// ---------------------------------------------------------------------------------------------
// A Studio stub that records every op and answers read_script / dump_scripts from a fake place.
// ---------------------------------------------------------------------------------------------

function studio(place = {}, overrides = {}) {
  const ops = [];
  const files = { ...place };
  const ctx = {
    env: {},
    studioConnected: () => true,
    addMemoryFact: async () => {},
    execStudioOp: async (o) => {
      ops.push(o);
      if (overrides[o.op]) return overrides[o.op](o, files);
      if (o.op === 'read_script') {
        const f = files[o.path];
        if (!f) return { ok: false, error: `script not found: ${o.path}` };
        return { ok: true, data: { path: o.path, source: f.source, baseHash: sourceHash(f.source), class: f.class } };
      }
      if (o.op === 'dump_scripts') {
        return {
          ok: true,
          data: {
            scripts: Object.entries(files).map(([path, f]) => ({ path, class: f.class, source: f.source })),
            truncated: false,
          },
        };
      }
      if (o.op === 'edit_script') {
        // The stub applies the write the way the plugin does — base-hash check first, then either
        // a full replace or the ordered find/replace list — so a test can read the place back and
        // ask what is actually in it, rather than trusting the tool's own report.
        const current = files[o.path];
        if (o.baseHash !== undefined && current && sourceHash(current.source) !== o.baseHash) {
          return { ok: false, error: `${o.path} changed in Studio since it was read` };
        }
        let next;
        if (o.source !== undefined) {
          next = o.source;
        } else {
          const applied = applyEdits(current.source, o.edits ?? []);
          if (!applied.ok) return { ok: false, error: applied.error };
          next = applied.source;
        }
        files[o.path] = { source: next, class: current?.class ?? o.create?.className };
        return { ok: true, data: { path: o.path, mode: o.source !== undefined ? 'replace' : 'edits', lines: next.split('\n').length } };
      }
      return { ok: true, data: { ok: true } };
    },
  };
  return { ctx, ops, files, wrote: () => ops.filter((o) => o.op === 'edit_script') };
}

const GOOD = 'local Part = workspace:WaitForChild("Ring")\nprint(Part.Name)\n';

// ---------------------------------------------------------------------------------------------
// 1. Syntax validation, before the write rather than after it
// ---------------------------------------------------------------------------------------------

test('checkSyntax reports the position of a real parse error, and nothing on a clean file', () => {
  const problems = checkSyntax('local function f()\n  return 1\n');
  assert.equal(problems.length >= 1, true, 'an unterminated function must be a parse error');
  assert.equal(typeof problems[0].line, 'number');
  assert.equal(typeof problems[0].message, 'string');
  assert.deepEqual(checkSyntax(GOOD), [], 'the control file parses');
});

test('edit_script REFUSES a body that does not parse, and no write reaches Studio', async () => {
  const s = studio({ 'game.ServerScriptService.A': { source: GOOD, class: 'Script' } });
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: 'game.ServerScriptService.A',
    source: 'local function f()\n  return 1\n', // missing `end` — the ONLY defect
  });
  assert.match(String(res.error), /would not parse/);
  assert.equal(s.wrote().length, 0, 'the refusal must be a refusal: nothing may be written');
  assert.equal(s.files['game.ServerScriptService.A'].source, GOOD, 'the place is untouched');
});

test('CONTROL: the same edit with the `end` restored is written', async () => {
  const s = studio({ 'game.ServerScriptService.A': { source: GOOD, class: 'Script' } });
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: 'game.ServerScriptService.A',
    source: 'local function f()\n  return 1\nend\nprint(f())\n',
  });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(s.wrote().length, 1);
});

test('the pre-write parse covers `edits` mode too — the RESULT is what is checked', async () => {
  // The base parses and each anchor is present; only the COMBINATION fails to compile. Nothing
  // that looks at the edits or at the base in isolation can catch this.
  const base = 'local n = 1\nif n > 0 then\n\tprint(n)\nend\n';
  const s = studio({ 'game.ServerScriptService.A': { source: base, class: 'Script' } });
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: 'game.ServerScriptService.A',
    edits: [{ find: 'end\n', replace: '' }],
  });
  assert.match(String(res.error), /would not parse/);
  assert.equal(s.wrote().length, 0);
  assert.equal(s.files['game.ServerScriptService.A'].source, base);
});

// ---------------------------------------------------------------------------------------------
// 2. applyEdits reproduces the plugin's transaction
// ---------------------------------------------------------------------------------------------

test('applyEdits matches Ops.luau: first occurrence only, unless `all`', () => {
  const src = 'x\nx\nx\n';
  assert.equal(applyEdits(src, [{ find: 'x', replace: 'y' }]).source, 'y\nx\nx\n');
  assert.equal(applyEdits(src, [{ find: 'x', replace: 'y', all: true }]).source, 'y\ny\ny\n');
});

test('applyEdits fails the whole list, naming the index, when an anchor is gone', () => {
  const r = applyEdits('a\nb\n', [{ find: 'a', replace: 'A' }, { find: 'zzz', replace: 'q' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /edit 2/, 'the model needs to know WHICH edit missed');
});

test('applyEdits fails an edit that changes nothing, which is how a stale belief surfaces', () => {
  const r = applyEdits('a\n', [{ find: 'a', replace: 'a' }]);
  assert.equal(r.ok, false);
  assert.match(r.error, /edit 1 changed nothing/);
});

test('edit_script surfaces a missing anchor as a refusal with nothing written', async () => {
  const s = studio({ 'game.ServerScriptService.A': { source: GOOD, class: 'Script' } });
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: 'game.ServerScriptService.A',
    edits: [{ find: 'this text is not in the file', replace: 'x' }],
  });
  assert.match(String(res.error), /not present/);
  assert.equal(s.wrote().length, 0);
});

// ---------------------------------------------------------------------------------------------
// 3. Concurrent edit detection — the two hashes must agree ACROSS LANGUAGES
// ---------------------------------------------------------------------------------------------

/** The `sourceHash` function lifted out of Ops.luau and run by the real interpreter. */
function pluginHash(strings) {
  const src = readFileSync(join(WORKER, '..', 'plugin', 'src', 'Ops.luau'), 'utf8');
  const start = src.indexOf('local function sourceHash(s: string): string');
  assert.notEqual(start, -1, 'Ops.luau no longer defines sourceHash — the wire contract is gone');
  const end = src.indexOf('\nend\n', start);
  assert.notEqual(end, -1, 'could not find the end of sourceHash in Ops.luau');
  const fn = src.slice(start, end + '\nend\n'.length);

  const script = join(TMP, 'hash.luau');
  const literals = strings.map((s) => JSON.stringify(s)).join(', ');
  writeFileSync(script, `${fn}\nlocal inputs = { ${literals} }\nfor _, s in inputs do print(sourceHash(s)) end\n`);
  const out = execFileSync('luau', [script], { encoding: 'utf8' });
  return out.trim().split('\n');
}

test('the worker and the plugin compute the SAME hash, including past ASCII', () => {
  // The fourth vector is the whole reason the worker encodes UTF-8 before hashing: an em-dash is
  // one UTF-16 code unit and three UTF-8 bytes, so a code-unit hash agrees on the first three
  // vectors and disagrees here — which would refuse every edit to that file forever.
  const vectors = ['', 'local x = 1\n', GOOD, '-- a comment with an em-dash — and an emoji 🧱\nreturn 1\n'];
  const fromPlugin = pluginHash(vectors);
  assert.equal(fromPlugin.length, vectors.length, 'the luau interpreter did not print one hash per vector');
  vectors.forEach((v, i) => {
    assert.equal(fromPlugin[i], sourceHash(v), `hash disagreement on vector ${i}: ${JSON.stringify(v)}`);
  });
  // A hash that returns the same value for everything would pass the line above; it must not.
  assert.equal(new Set(fromPlugin).size, vectors.length, 'the hash collapsed distinct inputs');
});

test('edit_script refuses when the base the edit was computed against is gone', async () => {
  const s = studio({ 'game.ServerScriptService.A': { source: GOOD, class: 'Script' } });
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: 'game.ServerScriptService.A',
    source: 'print("replacement")\n',
    base_hash: sourceHash('a DIFFERENT body that was read earlier\n'),
  });
  assert.match(String(res.error), /changed since you read it/);
  assert.equal(s.wrote().length, 0, 'a concurrent Studio edit must not be overwritten');
  assert.equal(res.currentBaseHash, sourceHash(GOOD), 'the reply must carry what the file is now');
});

test('CONTROL: the identical call with the CURRENT base hash is written', async () => {
  const s = studio({ 'game.ServerScriptService.A': { source: GOOD, class: 'Script' } });
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: 'game.ServerScriptService.A',
    source: 'print("replacement")\n',
    base_hash: sourceHash(GOOD),
  });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(s.wrote().length, 1);
});

test('every write carries the observed base hash onward, so the plugin can re-check it', async () => {
  const s = studio({ 'game.ServerScriptService.A': { source: GOOD, class: 'Script' } });
  await T.TOOLS.edit_script.run(s.ctx, { path: 'game.ServerScriptService.A', source: 'print(1)\n' });
  assert.equal(s.wrote()[0].baseHash, sourceHash(GOOD),
    'without this the race is only narrowed at the worker, not closed inside the transaction');
});

test('creating a script sends no base hash — there is no base to have observed', async () => {
  const s = studio({});
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: 'game.ServerScriptService.New',
    source: 'return {}\n',
    create_class: 'ModuleScript',
    create_parent: 'game.ServerScriptService',
  });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(s.wrote()[0].baseHash, undefined);
  assert.deepEqual(s.wrote()[0].create, { className: 'ModuleScript', parent: 'game.ServerScriptService' });
});

test('a read that fails for any reason OTHER than absence stops the write', async () => {
  const s = studio({}, { read_script: () => ({ ok: false, error: 'studio disconnected' }) });
  const res = await T.TOOLS.edit_script.run(s.ctx, { path: 'game.ServerScriptService.A', source: 'print(1)\n' });
  assert.match(String(res.error), /could not read/);
  assert.equal(s.wrote().length, 0, 'a failure to observe must not be read as "nothing is there"');
});

// ---------------------------------------------------------------------------------------------
// 4. The code_diff producer
// ---------------------------------------------------------------------------------------------

/** The after-file, rebuilt from the hunks: every `ctx` and `add` line, in order. */
function rebuildAfter(hunks) {
  return hunks.flatMap((h) => h.lines.filter((l) => l.kind !== 'del').map((l) => l.text));
}
function rebuildBefore(hunks) {
  return hunks.flatMap((h) => h.lines.filter((l) => l.kind !== 'add').map((l) => l.text));
}

test('the diff reconstructs both sides of the change, not just a count', () => {
  const before = ['a', 'b', 'c', 'd', 'e'].join('\n');
  const after = ['a', 'B', 'c', 'd', 'e'].join('\n');
  const hunks = diffHunks(before, after, { context: 1 });
  assert.equal(hunks.length, 1);
  assert.deepEqual(rebuildAfter(hunks), ['a', 'B', 'c'], 'the after-side must read back as the after-file');
  assert.deepEqual(rebuildBefore(hunks), ['a', 'b', 'c'], 'the before-side must read back as the before-file');
  assert.deepEqual(diffStat(hunks), { added: 1, removed: 1 });
});

test('an unchanged file produces no hunks at all, so no empty diff card is emitted', () => {
  assert.deepEqual(diffHunks(GOOD, GOOD), []);
});

test('edit_script emits a code_diff panel whose hunks describe the change that happened', async () => {
  const before = 'local a = 1\nlocal b = 2\nprint(a + b)\n';
  const s = studio({ 'game.ServerScriptService.A': { source: before, class: 'Script' } });
  const res = await T.TOOLS.edit_script.run(s.ctx, {
    path: 'game.ServerScriptService.A',
    edits: [{ find: 'local b = 2', replace: 'local b = 20' }],
  });
  assert.equal(res.error, undefined, JSON.stringify(res));
  const doc = s.ctx.uiDetail;
  assert.ok(doc, 'edit_script produced no uiDetail — the code_diff card had no producer before this');
  const block = doc.blocks[0];
  assert.equal(block.type, 'code_diff');
  assert.equal(block.path, 'game.ServerScriptService.A');
  assert.equal(block.language, 'luau');
  // The panel must describe the write that ACTUALLY happened, read back out of the place — not
  // the request the tool was given. The whole file fits in one hunk here, so the reconstruction is
  // the file.
  assert.deepEqual(rebuildAfter(block.hunks), s.files['game.ServerScriptService.A'].source.split('\n'));
  assert.deepEqual(rebuildBefore(block.hunks), before.split('\n'));
  assert.equal(res.added, 1);
  assert.equal(res.removed, 1);
});

test('the emitted code_diff is accepted by the browser validator that renders it', async () => {
  // A producer whose output the validator drops is a producer that produces nothing. The validator
  // lives in apps/web; bundling it here is the only way to assert the two ends agree.
  const v = join(TMP, 'validate.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, '..', 'web', 'src', 'lib', 'generative-ui', 'validate.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + v],
    { stdio: 'pipe' });
  const { validateDocument } = await import(`file://${v}`);

  const s = studio({ 'game.ServerScriptService.A': { source: 'local a = 1\nprint(a)\n', class: 'Script' } });
  await T.TOOLS.edit_script.run(s.ctx, {
    path: 'game.ServerScriptService.A',
    source: 'local a = 1\nlocal b = 2\nprint(a + b)\n',
  });
  const result = validateDocument(s.ctx.uiDetail);
  assert.equal(result.ok, true, `the validator rejected the worker's own diff: ${JSON.stringify(result.errors)}`);
  assert.equal(result.doc.blocks[0].type, 'code_diff');
  assert.ok(result.doc.blocks[0].hunks.length > 0, 'the hunks must survive validation, not just the block');
});

// ---------------------------------------------------------------------------------------------
// 5. Run-context identification — the fact that needs the tree, not the text
// ---------------------------------------------------------------------------------------------

test('a LocalScript in a server container is an error; the same source in StarterGui is not', () => {
  const source = 'local p = game.Players.LocalPlayer\nprint(p.Name)\n';
  const bad = contextFindings([{ path: 'game.ServerScriptService.Hud', className: 'LocalScript', source }]);
  assert.equal(bad.some((f) => f.rule === 'localscript-in-server-container'), true);

  // The control differs in exactly one respect: the container.
  const ok = contextFindings([{ path: 'game.StarterGui.Hud', className: 'LocalScript', source }]);
  assert.equal(ok.some((f) => f.rule === 'localscript-in-server-container'), false);
  assert.deepEqual(ok, [], 'the healthy placement must produce no finding at all');
});

test('a server Script in a Starter container is an error; the same class in Workspace is not', () => {
  const source = 'game.Players.PlayerAdded:Connect(function() end)\n';
  const bad = contextFindings([{ path: 'game.StarterGui.Round', className: 'Script', source }]);
  assert.equal(bad.some((f) => f.rule === 'server-script-in-client-container'), true);
  const ok = contextFindings([{ path: 'game.Workspace.Round', className: 'Script', source }]);
  assert.deepEqual(ok, []);
});

test('a script whose API vocabulary contradicts its class is reported', () => {
  const clientCode = 'local plr = game.Players.LocalPlayer\nlocal gui = plr:WaitForChild("PlayerGui")\nprint(gui)\n';
  const mismatch = contextFindings([{ path: 'game.Workspace.Thing', className: 'Script', source: clientCode }]);
  assert.equal(mismatch.some((f) => f.rule === 'run-context-mismatch'), true);
  // Control: the SAME source in a LocalScript in a client container is correct code.
  const fine = contextFindings([{ path: 'game.StarterGui.Thing', className: 'LocalScript', source: clientCode }]);
  assert.deepEqual(fine, []);
});

test('a LocalScript requiring a ServerStorage module is caught; the same module in ReplicatedStorage is fine', () => {
  const client = 'local M = require(game.ServerStorage.Shared)\nprint(M)\n';
  const bad = contextFindings([
    { path: 'game.StarterPlayer.StarterPlayerScripts.Boot', className: 'LocalScript', source: client },
    { path: 'game.ServerStorage.Shared', className: 'ModuleScript', source: 'return {}\n' },
  ]);
  assert.equal(bad.some((f) => f.rule === 'client-requires-server-module'), true);

  const good = contextFindings([
    { path: 'game.StarterPlayer.StarterPlayerScripts.Boot', className: 'LocalScript', source: 'local M = require(game.ReplicatedStorage.Shared)\nprint(M)\n' },
    { path: 'game.ReplicatedStorage.Shared', className: 'ModuleScript', source: 'return {}\n' },
  ]);
  assert.deepEqual(good, []);
});

// ---------------------------------------------------------------------------------------------
// 6. Static analysis reaching the product
// ---------------------------------------------------------------------------------------------

test('the two path vocabularies are converted, not assumed equal', () => {
  // The failure this guards is silent: a mismatched path produces an EMPTY graph, which reads as
  // "no cycles, nothing unresolved" — a clean report from a comparison that never happened.
  assert.equal(graphPath('game.ReplicatedStorage.Modules.Shop'), 'ReplicatedStorage/Modules/Shop');
  assert.equal(graphPath('game.Workspace.Ring'), 'Workspace/Ring');
  assert.equal(graphPath('game["Odd Name"].Thing'), 'Odd Name/Thing');
  assert.notEqual(graphPath('game.ReplicatedStorage.A'), 'game.ReplicatedStorage.A',
    'if this were a no-op the conversion would not be doing anything');
});

test('a require edge only resolves once BOTH sides are in the same vocabulary', () => {
  // The negative fixture: the same place with the dependency expressed against a path that is not
  // in the place. Exactly one thing differs from the passing cycle test above.
  const place = reviewPlace([
    { path: 'game.ReplicatedStorage.A', className: 'ModuleScript', source: 'local B = require(game.ReplicatedStorage.B)\nreturn { b = B }\n' },
    { path: 'game.ReplicatedStorage.B', className: 'ModuleScript', source: 'return {}\n' },
  ]);
  assert.deepEqual(place.dependencies.edges, [{ from: 'game.ReplicatedStorage.A', to: 'game.ReplicatedStorage.B' }],
    'the edge must resolve, and must be reported in the vocabulary the user can paste into Studio');
  assert.deepEqual(place.dependencies.unresolved, []);
});

test('reviewScript reports the Roblox semantic defect the eval rules know about', () => {
  const r = reviewScript('game.ServerScriptService.Shop', 'local rf = Instance.new("RemoteFunction")\nrf.Parent = workspace\nrf:InvokeClient(game.Players:GetPlayers()[1])\n');
  assert.equal(r.findings.some((f) => f.rule === 'remote-function-to-client'), true,
    'the rule exists in packages/evals and the product could not see it before this seam');
});

test('review_scripts surfaces a place-wide require cycle, and stays quiet on an acyclic place', async () => {
  const cyclic = {
    'game.ReplicatedStorage.A': { class: 'ModuleScript', source: 'local B = require(game.ReplicatedStorage.B)\nreturn { b = B }\n' },
    'game.ReplicatedStorage.B': { class: 'ModuleScript', source: 'local A = require(game.ReplicatedStorage.A)\nreturn { a = A }\n' },
  };
  const s = studio(cyclic);
  const res = await T.TOOLS.review_scripts.run(s.ctx, {});
  assert.equal(res.requireCycles.length, 1, JSON.stringify(res));
  assert.match(res.requireCycles[0], /ReplicatedStorage\.A/);

  // Control: break the cycle by making B a leaf. Nothing else changes.
  const acyclic = {
    ...cyclic,
    'game.ReplicatedStorage.B': { class: 'ModuleScript', source: 'return { a = 1 }\n' },
  };
  const s2 = studio(acyclic);
  const res2 = await T.TOOLS.review_scripts.run(s2.ctx, {});
  assert.deepEqual(res2.requireCycles, []);
});

test('review_scripts reads the whole place in ONE round trip', async () => {
  const s = studio({
    'game.ServerScriptService.A': { class: 'Script', source: 'print(1)\n' },
    'game.ServerScriptService.B': { class: 'Script', source: 'print(2)\n' },
    'game.ServerScriptService.C': { class: 'Script', source: 'print(3)\n' },
  });
  await T.TOOLS.review_scripts.run(s.ctx, {});
  assert.deepEqual(s.ops.map((o) => o.op), ['dump_scripts'],
    'one op, not one per script — otherwise a 40-script place spends a turn waiting');
});

test('review_scripts reports errors ahead of warnings, so a cap cannot hide them', async () => {
  const noisy = Array.from({ length: 40 }, (_, i) => `local unused${i} = ${i}`).join('\n');
  const s = studio({
    'game.ServerScriptService.Noisy': { class: 'Script', source: `${noisy}\nprint("done")\n` },
    'game.ServerScriptService.Broken': { class: 'Script', source: 'local function f()\n\treturn 1\n' },
  });
  const res = await T.TOOLS.review_scripts.run(s.ctx, {});
  assert.ok(res.findings.length > 0);
  assert.match(res.findings[0], /Broken/, 'the parse error must not be buried under 40 unused locals');
});

test('review_scripts changes nothing — it is a read tool and Plan may hold it', async () => {
  const s = studio({ 'game.ServerScriptService.A': { class: 'Script', source: GOOD } });
  await T.TOOLS.review_scripts.run(s.ctx, {});
  assert.equal(s.wrote().length, 0);
});

test('reviewPlace totals count the scripts it actually parsed', () => {
  const place = reviewPlace([
    { path: 'game.ServerScriptService.A', className: 'Script', source: 'print(1)\n' },
    { path: 'game.ServerScriptService.B', className: 'Script', source: 'local function f()\n' },
  ]);
  assert.equal(place.totals.scripts, 2);
  assert.equal(place.totals.parsed, 1, 'the unterminated file must not be counted as parsed');
  assert.ok(place.totals.errors >= 1);
});

// ---------------------------------------------------------------------------------------------
// 7. Symbol navigation: the thing text search cannot do
// ---------------------------------------------------------------------------------------------

const SHADOW = [
  'local value = 1',        // line 1
  'local function use()',   // 2
  '\tlocal value = 2',      // 3 — a DIFFERENT symbol with the same name
  '\treturn value',         // 4 — reads the inner one
  'end',                    // 5
  'print(value, use())',    // 6 — reads the outer one
  '',
].join('\n');

test('find_symbol resolves the inner binding, which a text search cannot tell from the outer', () => {
  const inner = symbolLookup('game.ServerScriptService.S', SHADOW, 4, 9);
  assert.ok(inner, 'nothing resolved at the inner read');
  assert.equal(inner.name, 'value');
  assert.equal(inner.definition.line, 3, 'the inner read must resolve to the inner declaration');

  const outer = symbolLookup('game.ServerScriptService.S', SHADOW, 6, 7);
  assert.ok(outer, 'nothing resolved at the outer read');
  assert.equal(outer.definition.line, 1, 'the outer read must resolve to the outer declaration');

  // The falsifier for "this is better than grep": grep cannot separate them at all.
  const textMatches = SHADOW.split('\n').filter((l) => l.includes('value')).length;
  assert.ok(textMatches > inner.references.length,
    'if the symbol index returned as many hits as a substring scan it would be adding nothing');
});

test('reads and writes are reported separately, which is the whole point of the split', () => {
  const src = 'local n = 0\nn = n + 1\nprint(n)\n';
  const hit = symbolLookup('game.ServerScriptService.S', src, 1, 7);
  assert.ok(hit);
  assert.equal(hit.writes >= 1, true, `expected a write, got ${JSON.stringify(hit)}`);
  assert.equal(hit.reads >= 2, true, `expected two reads, got ${JSON.stringify(hit)}`);
});

test('symbolSearch indexes declarations across a place, with the file they live in', () => {
  const hits = symbolSearch([
    { path: 'game.ReplicatedStorage.Shop', source: 'local function buy(item)\n\treturn item\nend\nreturn buy\n' },
    { path: 'game.ServerScriptService.Main', source: 'local function start()\nend\nreturn start\n' },
  ], 'buy');
  assert.equal(hits.length, 1, JSON.stringify(hits));
  assert.equal(hits[0].path, 'game.ReplicatedStorage.Shop');
  assert.equal(hits[0].name, 'buy');
});

test('find_symbol at a position returns the declaration and every reference to THAT binding', async () => {
  const s = studio({ 'game.ServerScriptService.S': { class: 'Script', source: SHADOW } });
  const res = await T.TOOLS.find_symbol.run(s.ctx, { path: 'game.ServerScriptService.S', line: 4, column: 9 });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.match(res.definedAt, /:3:/);
  assert.ok(res.references.every((r) => !r.includes(':6:')), 'the outer read must not appear among the inner references');
});

test('find_symbol by name searches the place, not one file', async () => {
  const s = studio({
    'game.ReplicatedStorage.Shop': { class: 'ModuleScript', source: 'local function buy()\nend\nreturn buy\n' },
    'game.ServerScriptService.Main': { class: 'Script', source: 'print(1)\n' },
  });
  const res = await T.TOOLS.find_symbol.run(s.ctx, { name: 'buy' });
  assert.equal(res.declarations.length, 1, JSON.stringify(res));
  assert.match(res.declarations[0], /ReplicatedStorage\.Shop/);
});

// ---------------------------------------------------------------------------------------------
// 8. Formatting, with the meaning-preserving property enforced rather than claimed
// ---------------------------------------------------------------------------------------------

test('formatScript normalises layout and preserves every token', () => {
  const messy = 'local   x=1\nif x>0    then\nprint(  x )\nend\n';
  const r = formatScript(messy);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.changed, true);
  // The property, not the spelling: the same identifiers and literals, in the same order.
  const words = (s) => s.match(/[A-Za-z_][A-Za-z0-9_]*|\d+/g);
  assert.deepEqual(words(r.code), words(messy));
});

test('formatScript refuses a file that does not lex rather than returning a mangled one', () => {
  const r = formatScript('local s = "unterminated\n');
  assert.equal(r.ok, false);
  assert.match(r.error, /does not lex/);
});

test('format_script writes the formatted body, pinned to the text it formatted', async () => {
  const messy = 'local   x=1\nprint( x )\n';
  const s = studio({ 'game.ServerScriptService.A': { class: 'Script', source: messy } });
  const res = await T.TOOLS.format_script.run(s.ctx, { path: 'game.ServerScriptService.A' });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.equal(res.changed, true);
  assert.equal(s.wrote().length, 1);
  assert.equal(s.wrote()[0].baseHash, sourceHash(messy), 'the reformat must not clobber a concurrent edit either');
  assert.notEqual(s.files['game.ServerScriptService.A'].source, messy);
  assert.deepEqual(checkSyntax(s.files['game.ServerScriptService.A'].source), [], 'the formatted file must still parse');
});

test('format_script on an already-formatted file writes nothing', async () => {
  const tidy = formatScript('local x = 1\nprint(x)\n');
  assert.equal(tidy.ok, true);
  const s = studio({ 'game.ServerScriptService.A': { class: 'Script', source: tidy.code } });
  const res = await T.TOOLS.format_script.run(s.ctx, { path: 'game.ServerScriptService.A' });
  assert.equal(res.changed, false);
  assert.equal(s.wrote().length, 0);
});

// ---------------------------------------------------------------------------------------------
// 9. Registration
// ---------------------------------------------------------------------------------------------

test('the three tools are registered and offered only with Studio attached', () => {
  for (const name of ['review_scripts', 'find_symbol', 'format_script']) {
    assert.ok(T.toolNames().includes(name), `${name} is not registered`);
    assert.ok(T.toolDefs(true, undefined).map((d) => d.name).includes(name));
    assert.equal(T.toolDefs(false, undefined).map((d) => d.name).includes(name), false);
  }
});
