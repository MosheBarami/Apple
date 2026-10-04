/**
 * create_instances: FEWER FAILURES, AND THE ONES THAT REMAIN SAY WHERE.
 *
 * Owner benchmark 2026-10-02: "Building new things: Did not work" many times, "Placing things around the map: Did not
 * work" 8+ times. No run log was on disk, so the causes here are the ones the code shows; each test pins the property
 * the fix gives, driving the REAL tools through a stubbed execStudioOp (so what is asserted is what Studio would be
 * sent and what the model would be handed).
 *
 *   - a bare Size/Position/Orientation/Color on a Part is typed, not refused; plain parts are Anchored unless said;
 *   - what is still ambiguous is refused with its LOCATION (`items[2].children[0].props.Size`), the how-to said once,
 *     inside the 3000-character tool-result ceiling;
 *   - a list over the plugin's limits is split into sequential calls; a failure part-way says how many landed;
 *     a single item over a limit is named, with the number;
 *   - one path spelling for every Studio tool (`Workspace.X` is `game.Workspace.X` for delete, set, scatter...);
 *   - a missing `items` says so; conflicts say which kind of conflict.
 *
 * Run with:  node --test tests/create-instances-batching.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'create-batching-'));
const bundle = (rel, name) => {
  const outfile = join(temp, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', rel), '--bundle', '--format=esm', '--target=es2022', '--platform=node', `--outfile=${outfile}`], { cwd: WORKER, stdio: 'pipe' });
  return pathToFileURL(outfile).href;
};
const T = await import(bundle('tools.ts', 'tools'));
const C = await import(bundle('created-paths.ts', 'created-paths'));
const F = await import(bundle('op-failure.ts', 'op-failure'));
rmSync(temp, { recursive: true, force: true });

const ctxWith = (answer, over = {}) => {
  const ops = [];
  return {
    ops,
    ctx: {
      env: {}, studioConnected: () => true, addMemoryFact: async () => 'refused',
      execStudioOp: async (op) => { ops.push(op); return answer(op, ops.length); },
      ...over,
    },
  };
};
const run = async (ctx, name, args) => {
  const r = await T.runTool(ctx, name, JSON.stringify(args));
  return { ...r, data: JSON.parse(r.resultForLlm) };
};
const ok = (op) => ({ ok: true, data: { created: op.items?.map((i) => `${i.parent}.${i.name}`) ?? [] } });
const post = (i, extra = {}) => ({ className: 'Part', name: `Lantern post ${i}`, parent: 'game.Workspace', ...extra });

test('a bare Size, Position and Color on a Part reach Studio typed, and the part is anchored', async () => {
  const { ctx, ops } = ctxWith(ok);
  const r = await run(ctx, 'create_instances', { items: [post(1, { props: { Size: [1, 8, 1], Position: [0, 4, 0], Color: [255, 200, 80], Material: 'Neon' } })] });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  const props = ops[0].items[0].props;
  assert.deepEqual(props.Size, { t: 'Vector3', v: [1, 8, 1] });
  assert.deepEqual(props.Position, { t: 'Vector3', v: [0, 4, 0] });
  assert.deepEqual(props.Color, { t: 'Color3', v: [1, 200 / 255, 80 / 255] });
  assert.deepEqual(props.Material, { t: 'EnumItem', v: 'Enum.Material.Neon' });
  assert.deepEqual(props.Anchored, { t: 'bool', v: true });
});

test('what stays ambiguous names its location and the how-to once, inside the tool-result ceiling', async () => {
  const { ctx, ops } = ctxWith(ok);
  const items = Array.from({ length: 120 }, (_, i) => post(i, { props: { CFrame: [0, i, 0] } }));
  items[2] = { className: 'Model', name: 'Arch', parent: 'game.Workspace', children: [{ className: 'Part', name: 'Keystone', props: { CFrame: [1, 2, 3] } }] };
  const r = await run(ctx, 'create_instances', { items });
  assert.match(r.data.error, /^Nothing was created\./);
  assert.match(r.data.error, /items\[2\]\.children\[0\]\.props\.CFrame \(an array of 3\)/);
  assert.equal((r.data.error.match(/Every property is tagged with its type/g) ?? []).length, 1);
  assert.ok(r.resultForLlm.length < 3000, `the result is ${r.resultForLlm.length} characters and would be cut mid-sentence`);
  assert.match(r.data.error, /and \d+ more/);
  assert.equal(ops.length, 0, 'nothing may reach Studio');
});

test('a missing or non-array items says so and sends nothing', async () => {
  for (const args of [{}, { items: 'a post' }, { instances: [post(1)] }]) {
    const { ctx, ops } = ctxWith(ok);
    const r = await run(ctx, 'create_instances', args);
    assert.match(r.data.error, /items was missing or not an array, so nothing was sent/);
    assert.equal(ops.length, 0);
  }
});

test('250 separate items go as three sequential calls and come back as one result', async () => {
  const { ctx, ops } = ctxWith(ok);
  const r = await run(ctx, 'create_instances', { items: Array.from({ length: 250 }, (_, i) => post(i)) });
  assert.equal(r.data.error, undefined, r.resultForLlm);
  assert.deepEqual(ops.map((o) => o.items.length), [120, 120, 10]);
  assert.equal(r.data.batches, 3);
  assert.equal(r.data.created.length, 20, 'the merged result carries the head of the created paths');
  assert.equal(r.data.createdMore, 230, 'and says how many more there are');
  assert.ok(r.resultForLlm.length < 3000, 'a merged result must fit the tool-result ceiling');
  assert.equal(r.data.createdItems, 250);
  assert.equal(r.mutatedProject, true);
});

test('a failure in the second batch says how many items DID land, and that the place changed', async () => {
  const { ctx } = ctxWith((op, n) => (n === 2 ? { ok: false, error: 'Studio is busy', failure: 'internal' } : ok(op)));
  const r = await run(ctx, 'create_instances', { items: Array.from({ length: 250 }, (_, i) => post(i)) });
  assert.match(r.data.error, /Batch 2 of 3 failed after 120 of 250 items were created: Studio is busy/);
  assert.match(r.data.error, /items from index 120 on were not created/);
  assert.equal(r.mutatedProject, true, 'the first batch changed the place; the run must know');
});

test('a single item over a plugin limit is named with the limit; it cannot be split', async () => {
  const { ctx, ops } = ctxWith(ok);
  const fat = { className: 'Model', name: 'Colonnade', parent: 'game.Workspace', children: Array.from({ length: 45 }, (_, i) => ({ className: 'Part', name: `Column ${i}` })) };
  const r = await run(ctx, 'create_instances', { items: [post(1), fat] });
  assert.match(r.data.error, /items\[1\] has 45 children; the limit is 40 per instance/);
  assert.equal(ops.length, 0);
});

test('every Studio tool reads Workspace.X as game.Workspace.X', async () => {
  const { ctx, ops } = ctxWith((op) => ({ ok: true, data: { deleted: op.paths ?? [], set: [], path: op.path } }));
  await run(ctx, 'delete_instances', { paths: ['Workspace.Lamp', 'workspace.Fence'] });
  assert.deepEqual(ops.find((o) => o.op === 'delete_instances').paths, ['game.Workspace.Lamp', 'game.Workspace.Fence']);
  await run(ctx, 'set_visible', { paths: ['Workspace.Lamp'], visible: false });
  assert.ok(ops.some((o) => (o.paths ?? [o.path]).every((p) => p === 'game.Workspace.Lamp')), 'set_visible still got the bare form');
  await run(ctx, 'move_instances', { moves: [{ path: 'Workspace.Lamp', newParent: 'Workspace.Lamps' }] });
  assert.deepEqual(ops.find((o) => o.op === 'move_instances').moves, [{ path: 'game.Workspace.Lamp', newParent: 'game.Workspace.Lamps' }]);
});

test('a conflict says which kind: names inside one call, or a parent that already has the name', async () => {
  const same = await run(ctxWith(() => ({ ok: false, error: 'two created instances would share the path game.Workspace.Post', failure: 'conflict' })).ctx, 'create_instances', { items: [post(1)] });
  assert.match(same.data.retry, /^Do not retry this as-is: two names in this call collide: rename one of them in this call/);
  const there = await run(ctxWith(() => ({ ok: false, error: 'game.Workspace already contains a child named Post', failure: 'conflict' })).ctx, 'create_instances', { items: [post(1)] });
  assert.match(there.data.retry, /game\.Workspace already has "Post": pick a new name, or edit the existing instance/);
  const other = await run(ctxWith(() => ({ ok: false, error: 'script already exists; remove create and read it before editing', failure: 'conflict' })).ctx, 'create_instances', { items: [post(1)] });
  assert.match(other.data.retry, /the place is not in the state this op required/, 'an unrecognised conflict keeps the generic reason');
});

test('a timed-out change says to read the tree before retrying; a missing target says to read the tree for the path', () => {
  assert.match(F.retryHint({ op: 'create_instances' }, { ok: false, failure: 'timeout' }), /read the tree to check before retrying/);
  assert.match(F.retryEligibility({ op: 'set_props' }, { ok: false, failure: 'not_found' }).reason, /read the tree for the correct path/);
  assert.doesNotMatch(F.retryEligibility({ op: 'set_props' }, { ok: false, failure: 'not_found' }).reason, /finds it again/);
});

// ---------------------------------------------------------------- the delete fence
test('created-paths: a delete is covered only when every path is one the run created or lies inside one', () => {
  let created = C.rememberCreated(undefined, 'create_instances', { created: ['game.Workspace.Post', 'game.Workspace.Arch'] });
  created = C.rememberCreated(created, 'insert_asset', { inserted: ['game.Workspace.StudPilot_Insert_1_ab.Oak'] });
  created = C.rememberCreated(created, 'get_tree', { created: ['game.Workspace.NotAnAdd'] });
  assert.deepEqual(created, ['game.Workspace.Post', 'game.Workspace.Arch', 'game.Workspace.StudPilot_Insert_1_ab.Oak'], 'only ops that add instances are remembered');
  assert.equal(C.coveredByCreated(created, ['game.Workspace.Post']), true);
  assert.equal(C.coveredByCreated(created, ['game.Workspace.Post.Plank', 'game.Workspace.Arch']), true, 'a descendant of a created path is covered');
  assert.equal(C.coveredByCreated(created, ['game.Workspace.Post', 'game.Workspace.OldHouse']), false, 'one pre-existing path keeps the fence');
  assert.equal(C.coveredByCreated(created, ['game.Workspace.PostOffice']), false, 'a longer sibling name is not inside a created path');
  assert.equal(C.coveredByCreated(undefined, ['game.Workspace.Post']), false);
  assert.equal(C.coveredByCreated(created, []), false, 'an empty delete covers nothing');
  const many = C.addCreated(undefined, Array.from({ length: 400 }, (_, i) => `game.Workspace.P${i}`));
  assert.equal(many.length, 150, 'the persisted list must stay bounded');
});

// Benchmark 2026-10-04, item o05: create_instances with className Script went to Studio and came back "class Script is not in
// StudPilot's create allowlist", which named no way forward. A script class (at any depth) is answered before Studio, naming the tool.
test('a script class is answered before Studio, naming edit_script', async () => {
  const { ctx, ops } = ctxWith(ok);
  const r = await run(ctx, 'create_instances', { items: [{ className: 'Model', name: 'Jukebox', parent: 'game.Workspace', children: [{ className: 'Script', name: 'Play' }] }] });
  assert.match(String(r.data.error), /edit_script/);
  assert.match(String(r.data.error), /create_class/);
  assert.equal(ops.length, 0, 'nothing was sent to Studio');
  const plain = await run(ctxWith(ok).ctx, 'create_instances', { items: [post(1)] });
  assert.equal(plain.data.error, undefined, 'a part is still created');
});
