/**
 * DUPLICATE-NAMED SIBLINGS, WORKER SIDE: clone_instances accepts repeated sources, the tree tells the agent
 * how to address one of several same-named instances (only when the connected plugin can honour it), and the
 * benchmark's place reset can empty a place that is full of duplicate names.
 *
 * The plugin half is apps/apple-plugin/tests/duplicate-names.test.mjs. Everything here has to degrade with
 * the PUBLISHED plugin, which cannot write through a read reference: that plugin's tree carries no
 * `refsWritable`, and its refusals are what a fake `execStudioOp` below reproduces.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'dup-names-'));
const bundle = (entry, name) => {
  const out = join(dir, name);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', entry), '--bundle', '--format=esm', '--platform=node', '--target=es2022', `--outfile=${out}`, '--external:cloudflare:*'], { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const T = await import(`file://${bundle('tools.ts', 't.mjs')}`);
const D = await import(`file://${bundle('dup-names.ts', 'd.mjs')}`);
const B = await import(`file://${bundle('owner-bench.ts', 'b.mjs')}`);
process.on('exit', () => rmSync(dir, { recursive: true, force: true }));

const REF = (n) => `read-ref:00000001-0000-4000-8000-000000000000:${n}`;

/* ------------------------------------------------------------------ the copy plan --- */

test('a path listed N times is N copies, planned as rounds that never repeat a path inside one op', () => {
  const plan = D.planCopyRounds(['game.Workspace.A', 'game.Workspace.B', 'game.Workspace.A', 'game.Workspace.A']);
  assert.deepEqual(plan.rounds, [['game.Workspace.A', 'game.Workspace.B'], ['game.Workspace.A'], ['game.Workspace.A']]);
  assert.equal(plan.total, 4);
});

test('copies multiplies every listed source, and one copy of each is a single round', () => {
  assert.deepEqual(D.planCopyRounds(['game.Workspace.A', 'game.Workspace.B']).rounds, [['game.Workspace.A', 'game.Workspace.B']]);
  const plan = D.planCopyRounds(['game.Workspace.A', 'game.Workspace.B'], 3);
  assert.equal(plan.rounds.length, 3);
  assert.equal(plan.total, 6);
});

test('the copy plan refuses a request that would make more copies than one call may', () => {
  const plan = D.planCopyRounds(['game.Workspace.A'], 500);
  assert.match(plan.error, /at most 120/);
  assert.match(D.planCopyRounds(['a'], 0).error, /whole number from 1/);
  assert.match(D.planCopyRounds(['a'], 1.5).error, /whole number from 1/);
});

/* ---------------------------------------------------------------- clone_instances --- */

const recorder = (answer) => {
  const sent = [];
  const ctx = {
    env: {}, studioConnected: () => true,
    execStudioOp: async (op) => { sent.push(op); return answer(op, sent.length); },
  };
  return { ctx, sent };
};

test('clone_instances with a repeated source makes N copies instead of failing', async () => {
  const { ctx, sent } = recorder((op, n) => ({ ok: true, data: { created: op.paths.map((p, i) => `${p} (copy ${n}.${i})`), count: op.paths.length } }));
  const res = await T.runTool(ctx, 'clone_instances', JSON.stringify({ paths: ['game.Workspace.Tree', 'game.Workspace.Tree', 'game.Workspace.Tree'] }));
  assert.equal(res.ok, true, res.resultForLlm);
  assert.equal(sent.length, 3, 'one round per copy');
  for (const op of sent) {
    assert.equal(op.op, 'clone_instances');
    assert.equal(new Set(op.paths).size, op.paths.length, 'a plugin op never receives a repeated path');
  }
  const body = JSON.parse(res.resultForLlm);
  assert.equal(body.count, 3);
  assert.equal(body.created.length, 3);
});

test('clone_instances takes a copies count, and carries the parent into every round', async () => {
  const { ctx, sent } = recorder((op) => ({ ok: true, data: { created: op.paths.map((p) => `${op.parent}.x`), count: op.paths.length } }));
  const res = await T.runTool(ctx, 'clone_instances', JSON.stringify({ paths: ['game.Workspace.Rock'], copies: 4, parent: 'game.Workspace.Field' }));
  assert.equal(res.ok, true, res.resultForLlm);
  assert.equal(sent.length, 4);
  assert.ok(sent.every((op) => op.parent === 'game.Workspace.Field'));
  assert.equal(JSON.parse(res.resultForLlm).count, 4);
});

test('a single clone is still one op, with the same shape as before', async () => {
  const { ctx, sent } = recorder((op) => ({ ok: true, data: { created: ['game.Workspace.A (2)'], count: 1 } }));
  const res = await T.runTool(ctx, 'clone_instances', JSON.stringify({ paths: ['game.Workspace.A'] }));
  assert.equal(res.ok, true);
  assert.deepEqual(sent, [{ op: 'clone_instances', paths: ['game.Workspace.A'] }]);
});

test('read references are valid clone sources, and are not mistaken for repeats of each other', async () => {
  const { ctx, sent } = recorder((op) => ({ ok: true, data: { created: op.paths, count: op.paths.length } }));
  const res = await T.runTool(ctx, 'clone_instances', JSON.stringify({ paths: [REF(1), REF(2), REF(1)] }));
  assert.equal(res.ok, true, res.resultForLlm);
  assert.deepEqual(sent.map((o) => o.paths), [[REF(1), REF(2)], [REF(1)]]);
});

test('a failure part-way says what was already made, so nothing is cloned twice', async () => {
  const { ctx } = recorder((op, n) => n === 2
    ? { ok: false, error: 'Studio refused', failure: 'refused' }
    : { ok: true, data: { created: ['game.Workspace.A (2)'], count: 1 } });
  const res = await T.runTool(ctx, 'clone_instances', JSON.stringify({ paths: ['game.Workspace.A', 'game.Workspace.A', 'game.Workspace.A'] }));
  const body = JSON.parse(res.resultForLlm);
  assert.match(body.error, /Studio refused/);
  assert.equal(body.completed, 1);
  assert.deepEqual(body.created, ['game.Workspace.A (2)']);
  assert.equal(res.mutatedProject, true, 'the run loop is told the place changed');
  assert.equal(body.projectMutated, undefined, 'bookkeeping stays out of what the model reads');
});

test('other tools keep refusing a repeated path: removing the same thing twice is still a mistake', async () => {
  const { ctx, sent } = recorder(() => ({ ok: true, data: {} }));
  const res = await T.runTool(ctx, 'transform_instances', JSON.stringify({ paths: ['game.Workspace.A', 'game.Workspace.A'], move: [1, 0, 0] }));
  assert.match(res.resultForLlm, /more than once/);
  assert.equal(sent.length, 0);
});

/* ------------------------------------------------------------------- the outline --- */

const part = (path, name, extra = {}) => ({ path: `${path}.${name}`, name, class: 'Part', ...extra });

test('a plugin that reports refsWritable has its read references offered as addresses for any tool', async () => {
  const tree = { refsWritable: true, root: { path: 'game.Workspace.Pack', name: 'Pack', class: 'Folder', children: [
    part('game.Workspace.Pack', 'Tree', { readRef: REF(1) }), part('game.Workspace.Pack', 'Tree', { readRef: REF(2) }),
  ] } };
  const { ctx } = recorder(() => ({ ok: true, data: tree }));
  const res = await T.runTool(ctx, 'get_project_tree', JSON.stringify({ root: 'game.Workspace.Pack' }));
  const outline = JSON.parse(res.resultForLlm).outline;
  assert.match(outline, new RegExp(`readRef=${REF(1)} \\(use it as the path in any tool\\)`));
  assert.match(outline, /ambiguous: 2 siblings named Tree; address each by its readRef/);
  assert.doesNotMatch(outline, /reads only/);
});

test('an older plugin keeps the old, honest wording: the reference reads, and a duplicate cannot be written', async () => {
  const tree = { root: { path: 'game.Workspace.Pack', name: 'Pack', class: 'Folder', children: [
    part('game.Workspace.Pack', 'Tree', { readRef: REF(1) }), part('game.Workspace.Pack', 'Tree', { readRef: REF(2) }),
  ] } };
  const { ctx } = recorder(() => ({ ok: true, data: tree }));
  const res = await T.runTool(ctx, 'get_project_tree', JSON.stringify({ root: 'game.Workspace.Pack' }));
  const outline = JSON.parse(res.resultForLlm).outline;
  assert.match(outline, new RegExp(`readRef=${REF(1)} \\(get_instance reads only\\)`));
  assert.match(outline, /this path cannot select one/);
});

test('the tools that take a path tell the agent it may be a readRef, so it does not give up on a duplicate', () => {
  for (const name of ['delete_instances', 'set_properties', 'rename_instance', 'clone_instances', 'move_instances']) {
    const def = T.TOOLS[name].def;
    assert.match(def.description, /readRef/, `${name} must say a readRef is an address`);
  }
  assert.match(T.TOOLS.clone_instances.def.description, /copies/);
});

/* ------------------------------------------------------------------ clearChildren --- */

/**
 * A fake Studio holding children of one root. `modern` is a plugin that honours references; the old one
 * answers a reference with the "invalid path" refusal it really gives, and refuses an ambiguous path.
 */
let nextId = 1; // global, so a reference is unique across every fake root
const fakePlace = (names, { modern = true, failOn = () => false, root = 'game.Workspace' } = {}) => {
  const kids = names.map((name) => ({ name, id: nextId++ }));
  const calls = [];
  const nameCount = () => kids.reduce((m, k) => m.set(k.name, (m.get(k.name) ?? 0) + 1), new Map());
  const exec = async (op) => {
    calls.push(op);
    if (op.op === 'get_tree') {
      const counts = nameCount();
      const children = kids.slice(0, 399).map((k) => ({
        name: k.name, path: `${root}.${k.name}`, class: 'Part',
        ...(counts.get(k.name) > 1 ? { readRef: REF(k.id) } : {}),
      }));
      return { ok: true, data: { root: { path: root, name: root.split('.').pop(), children }, ...(modern ? { refsWritable: true } : {}) } };
    }
    if (op.op === 'delete_instances') {
      const doomed = [];
      for (const p of op.paths) {
        let k;
        if (p.startsWith('read-ref:')) {
          if (!modern) return { ok: false, error: 'path must start with "game"', failure: 'invalid' };
          k = kids.find((x) => REF(x.id) === p);
          if (!k) return { ok: false, error: 'read reference expired or is unknown', failure: 'not_found' };
        } else {
          const name = p.slice(root.length + 1);
          const same = kids.filter((x) => x.name === name);
          if (same.length > 1) return { ok: false, error: `path is ambiguous at game.Workspace because ${same.length} siblings are named ${name}`, failure: 'conflict' };
          k = same[0];
          if (!k) return { ok: false, error: `instance not found at ${p}`, failure: 'not_found' };
        }
        if (failOn(k)) return { ok: false, error: 'Studio refused', failure: 'refused' };
        doomed.push(k);
      }
      for (const k of doomed) kids.splice(kids.indexOf(k), 1);
      return { ok: true, data: { deleted: op.paths, count: op.paths.length } };
    }
    return { ok: false, error: 'unexpected op ' + op.op, failure: 'invalid' };
  };
  return { exec, kids, calls };
};

test('a place full of one repeated name is emptied by reference, in chunks, until nothing is left', async () => {
  const place = fakePlace([...Array.from({ length: 250 }, () => 'Tree'), 'Camera', 'Rock', 'Rock']);
  const res = await D.clearChildren(place.exec, 'game.Workspace', { keep: (c) => c.name === 'Camera' });
  assert.deepEqual(place.kids.map((k) => k.name), ['Camera']);
  assert.equal(res.removed, 252);
  assert.deepEqual(res.left, []);
  const deletes = place.calls.filter((c) => c.op === 'delete_instances');
  assert.ok(deletes.every((c) => c.paths.length <= 100), 'no delete carries more than 100 addresses');
  assert.ok(deletes.every((c) => new Set(c.paths).size === c.paths.length));
});

test('a name that is repeated once is deleted by reference and the survivor by its plain path', async () => {
  const place = fakePlace(['Door', 'Door', 'Lamp']);
  const res = await D.clearChildren(place.exec, 'game.Workspace', {});
  assert.deepEqual(place.kids, []);
  assert.equal(res.removed, 3);
});

test('with the published plugin, unique names are cleared and every duplicate is reported by name, not looped on', async () => {
  const place = fakePlace(['Door', 'Door', 'Lamp', 'Camera'], { modern: false });
  const res = await D.clearChildren(place.exec, 'game.Workspace', { keep: (c) => c.name === 'Camera' });
  assert.deepEqual(place.kids.map((k) => k.name).sort(), ['Camera', 'Door', 'Door']);
  assert.equal(res.removed, 1);
  assert.equal(res.left.length, 2);
  assert.match(res.left[0].why, /plugin/);
  assert.ok(place.calls.length < 12, `it must stop, not spin (made ${place.calls.length} calls)`);
});

test('one refused child does not stop the others, and is reported as left', async () => {
  const place = fakePlace(['A', 'B', 'C'], { failOn: (k) => k.name === 'B' });
  const res = await D.clearChildren(place.exec, 'game.Workspace', {});
  assert.deepEqual(place.kids.map((k) => k.name), ['B']);
  assert.equal(res.removed, 2);
  assert.equal(res.left.length, 1);
  assert.equal(res.left[0].path, 'game.Workspace.B');
});

test('a root Studio cannot read is skipped, not an error', async () => {
  const res = await D.clearChildren(async () => ({ ok: false, error: 'instance not found', failure: 'not_found' }), 'game.Nowhere', {});
  assert.deepEqual(res, { removed: 0, left: [], read: false });
});

test('benchClean empties a place whose roots all hold duplicates, and keeps the baseplate parts', async () => {
  const places = {
    'game.Workspace': fakePlace(['Camera', 'Terrain', 'Baseplate', 'SpawnLocation', 'Tree', 'Tree', 'Tree', 'House', 'House'], { root: 'game.Workspace' }),
    'game.StarterGui': fakePlace(['Hud', 'Hud'], { root: 'game.StarterGui' }),
  };
  const exec = async (op) => {
    if (op.op === 'get_tree') return places[op.root] ? places[op.root].exec(op) : { ok: false, error: 'instance not found', failure: 'not_found' };
    if (op.op === 'delete_instances') {
      const first = op.paths[0];
      const place = first.startsWith('read-ref:')
        ? Object.values(places).find((p) => p.kids.some((k) => REF(k.id) === first))
        : Object.entries(places).find(([root]) => first.startsWith(root + '.'))?.[1];
      return place ? place.exec(op) : { ok: false, error: 'instance not found', failure: 'not_found' };
    }
    return { ok: true, data: {} };
  };
  const left = await B.benchClean({ execStudioOp: exec });
  assert.deepEqual(left, []);
  assert.deepEqual(places['game.Workspace'].kids.map((k) => k.name), ['Camera', 'Terrain', 'Baseplate', 'SpawnLocation']);
  assert.deepEqual(places['game.StarterGui'].kids, []);
});

test('benchClean with the published plugin reports each duplicate it cannot remove, and finishes', async () => {
  const place = fakePlace(['Camera', 'Tree', 'Tree', 'Lamp'], { modern: false, root: 'game.Workspace' });
  const exec = async (op) => (op.op === 'get_tree' && op.root !== 'game.Workspace') ? { ok: false, error: 'instance not found', failure: 'not_found' }
    : (op.op === 'get_tree' || op.op === 'delete_instances') ? place.exec(op) : { ok: true, data: {} };
  const left = await B.benchClean({ execStudioOp: exec });
  assert.equal(left.length, 2);
  assert.ok(left.every((l) => /Tree/.test(l)), left.join('; '));
  assert.deepEqual(place.kids.map((k) => k.name).sort(), ['Camera', 'Tree', 'Tree']);
});
