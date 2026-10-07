// library_code (master plan §8 step 6): only audited, graded, standalone library packages reach a place, dependencies
// go in first and once, and the licence notice travels with the code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerable, audit, insertPlan, treeOps, header, aliasFor } from '../src/library-code.ts';

const row = (id, over = {}) => ({
  id, title: id, package_name: id.split(':').pop(), grade: 'A', standalone: 1, bundle_key: `library/code/${id}.json`,
  sanitize: JSON.stringify({ audit: 'clean-scan' }), grade_notes: '[]', deps: '[]', licence_class: 'mit', attribution: 'Copyright (c) 2021 X', source_url: 'https://github.com/x/y', ...over,
});

test('offered: A or B, standalone, bundled, not unsafe; a restricted package says what it is for', () => {
  assert.equal(offerable(row('code:a:x')), true);
  assert.equal(offerable(row('code:a:x', { grade: 'C' })), false);
  assert.equal(offerable(row('code:a:x', { standalone: 0 })), false, 'a loader-bound module never reaches a plain place');
  assert.equal(offerable(row('code:a:x', { sanitize: JSON.stringify({ audit: 'unsafe' }) })), false);
  const r = row('code:a:x', { sanitize: JSON.stringify({ audit: 'restricted', audit_notes: [{ verdict: 'restricted', why: 'prompts real purchases; only for a shop' }] }) });
  assert.equal(offerable(r), true);
  assert.match(audit(r).note, /only for a shop/);
});

function env(rows, bundles) {
  return {
    CORPUS: { prepare: (sql) => ({ bind: (...ids) => ({ first: async () => rows[ids[0]] ?? null, all: async () => ({ results: ids.map((i) => rows[i]).filter(Boolean) }) }) }) },
    MEDIA: { get: async (key) => (bundles[key] ? { text: async () => JSON.stringify(bundles[key]) } : null) },
  };
}
const leaf = (name) => ({ name, className: 'ModuleScript', source: 'return {}' });

test('a package goes in after its dependencies, each once', async () => {
  const rows = { 'code:r:comm': row('code:r:comm'), 'code:r:signal': row('code:r:signal'), 'code:p:promise': row('code:p:promise') };
  const bundles = {
    'library/code/code:r:comm.json': { id: 'code:r:comm', name: 'Comm', tree: leaf('Comm'), deps: [{ alias: 'Signal', id: 'code:r:signal' }, { alias: 'Promise', id: 'code:p:promise' }], licence: 'mit', source_url: 'u' },
    'library/code/code:r:signal.json': { id: 'code:r:signal', name: 'Signal', tree: leaf('Signal'), deps: [{ alias: 'Promise', id: 'code:p:promise' }], licence: 'mit', source_url: 'u' },
    'library/code/code:p:promise.json': { id: 'code:p:promise', name: 'RobloxLuaPromise', tree: leaf('RobloxLuaPromise'), deps: [], licence: 'mit', source_url: 'u' },
  };
  const plan = await insertPlan(env(rows, bundles), 'code:r:comm');
  assert.deepEqual(plan.bundles.map((b) => b.id), ['code:p:promise', 'code:r:signal', 'code:r:comm']);
  assert.equal(aliasFor(plan.bundles, 'code:p:promise', 'RobloxLuaPromise'), 'Promise', 'a dependency takes the name its dependents require');
});

test('nothing is planned when the package or any dependency is not offered or not in the library', async () => {
  const rows = { 'code:r:a': row('code:r:a'), 'code:r:bad': row('code:r:bad', { sanitize: JSON.stringify({ audit: 'unsafe' }) }) };
  const bundles = { 'library/code/code:r:a.json': { id: 'code:r:a', name: 'A', tree: leaf('A'), deps: [{ alias: 'Bad', id: 'code:r:bad' }], licence: 'mit', source_url: 'u' } };
  assert.match((await insertPlan(env(rows, bundles), 'code:r:a')).error, /code:r:bad is not offered/);
  const missing = { 'library/code/code:r:a.json': { ...bundles['library/code/code:r:a.json'], deps: [{ alias: 'Gone', id: null }] } };
  assert.match((await insertPlan(env(rows, missing), 'code:r:a')).error, /needs Gone, which is not in the library/);
  assert.match((await insertPlan(env(rows, bundles), 'kenney:nature-kit:tree')).error, /no library code module/);
});

test('tree ops: parents before children, the notice on the root only, folders as Folders', () => {
  const tree = { name: 'Comm', className: 'ModuleScript', source: 'return 1', children: [{ name: 'Server', className: 'Folder', children: [leaf('Util')] }, { name: 'Boot', className: 'Script', source: 'print(1)' }] };
  const b = { name: 'Comm', attribution: 'Copyright (c) 2021 Stephen Leitnick', licence: 'mit', source_url: 'https://github.com/Sleitnick/RbxUtil' };
  const ops = treeOps(tree, 'game.ReplicatedStorage.Packages', header(b));
  assert.deepEqual(ops.map((o) => o.op === 'edit_script' ? o.path : `${o.items[0].parent}.${o.items[0].name}`), [
    'game.ReplicatedStorage.Packages.Comm', 'game.ReplicatedStorage.Packages.Comm.Server', 'game.ReplicatedStorage.Packages.Comm.Server.Util', 'game.ReplicatedStorage.Packages.Comm.Boot',
  ]);
  assert.match(ops[0].source, /^-- Comm: Copyright \(c\) 2021 Stephen Leitnick\n-- From the StudPilot Library \(mit/);
  assert.equal(ops[2].source, 'return {}', 'children keep their own source');
  assert.equal(ops[3].create.className, 'Script');
  assert.throws(() => treeOps({ name: 'a.b', className: 'ModuleScript', source: '' }, 'game'), /cannot name/);
});
