import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const panel = readFileSync(new URL('../src/components/ws/files-panel.tsx', import.meta.url), 'utf8');

// Run the component's actual mutation callback. No copied mutation implementation or DOM claims.
function mutationFactory(source = panel) {
  const tree = ts.createSourceFile('files-panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'act'
      && node.initializer && ts.isCallExpression(node.initializer)) {
      callback = node.initializer.arguments[0];
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(callback && ts.isArrowFunction(callback), 'actual useCallback mutation handler exists');
  const js = ts.transpileModule(`const run = ${callback.getText(tree)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function('setBusy', 'setNotice', 'fileOp', 'projectId', 'refusalCopy',
    'listing', 'refresh', 'setOpen', 'setPrefix', 'parentPrefix', `${js}\nreturn run;`);
}

function harness({ source = panel, open = 'notes/plan.luau', prefix = 'notes', result = { ok: true, result: {} }, operation,
  listRefresh = async () => {} } = {}) {
  const state = { open, prefix, busy: false, notice: null };
  const requests = [];
  const set = (key) => (value) => { state[key] = typeof value === 'function' ? value(state[key]) : value; };
  const listing = { refetch: async () => { requests.push('listing'); await listRefresh(); } };
  // This represents the callback's OLD observer identities, which cannot be retargeted by setOpen.
  const refresh = async () => {
    await listing.refetch();
    if (open !== null) requests.push(`content:${open}`, `history:${open}`);
  };
  const act = mutationFactory(source)(set('busy'), set('notice'), operation ?? (async () => result),
    'owned-project', (_code, error) => error, listing, refresh, set('open'), set('prefix'),
    (path) => path.split('/').filter(Boolean).slice(0, -1).join('/'));
  return { act, state, requests };
}

test('successful rename follows the confirmed destination without fetching the retired path', async () => {
  const h = harness({ result: { ok: true, result: { to: 'design/final.luau' } } });
  await h.act({ op: 'rename', path: 'notes/plan.luau', to: 'design/final.luau' }, 'Renamed');
  assert.equal(h.state.open, 'design/final.luau');
  assert.deepEqual(h.requests, ['listing']);
  assert.equal(h.state.busy, false);
});

test('successful delete closes only the deleted preview and never fetches its retired content/history', async () => {
  const h = harness();
  await h.act({ op: 'delete', path: 'notes/plan.luau' }, 'Moved to the trash');
  assert.equal(h.state.open, null);
  assert.deepEqual(h.requests, ['listing']);
});

test('a refused rename preserves the current preview and still refreshes the listing', async () => {
  const h = harness({ result: { ok: false, code: 'occupied', error: 'That path already exists.' } });
  assert.equal(await h.act({ op: 'rename', path: 'notes/plan.luau', to: 'other.luau' }, 'Renamed'), null);
  assert.equal(h.state.open, 'notes/plan.luau');
  assert.equal(h.state.notice, 'That path already exists.');
  assert.deepEqual(h.requests, ['listing']);
});

for (const op of ['copy', 'revert', 'undelete']) {
  test(`${op} keeps refreshing content and history for an unchanged selected path`, async () => {
    const h = harness();
    await h.act({ op, path: 'notes/plan.luau', version: 1 }, 'Done');
    assert.equal(h.state.open, 'notes/plan.luau');
    assert.deepEqual(h.requests, ['listing', 'content:notes/plan.luau', 'history:notes/plan.luau']);
  });
}

test('moving a folder follows a selected descendant and its browsing prefix', async () => {
  const h = harness({ open: 'notes/deep/plan.luau', prefix: 'notes/deep' });
  await h.act({ op: 'move_folder', path: 'notes/', to: 'design/' }, 'Moved');
  assert.equal(h.state.open, 'design/deep/plan.luau');
  assert.equal(h.state.prefix, 'design/deep');
  assert.deepEqual(h.requests, ['listing']);
});

test('deleting a folder closes descendants, goes to its parent, and does not match sibling prefixes', async () => {
  const h = harness({ open: 'root/notes/deep/plan.luau', prefix: 'root/notes/deep' });
  await h.act({ op: 'delete_folder', path: 'root/notes' }, 'Trashed');
  assert.equal(h.state.open, null);
  assert.equal(h.state.prefix, 'root');
  assert.deepEqual(h.requests, ['listing']);
  const sibling = harness({ open: 'root/notes-archive/plan.luau', prefix: 'root/notes-archive' });
  await sibling.act({ op: 'delete_folder', path: 'root/notes' }, 'Trashed');
  assert.equal(sibling.state.open, 'root/notes-archive/plan.luau');
  assert.equal(sibling.state.prefix, 'root/notes-archive');
});

test('navigation during a pending rename is not overwritten by its late result', async () => {
  let resolve;
  const h = harness({ operation: () => new Promise((done) => { resolve = done; }) });
  const pending = h.act({ op: 'rename', path: 'notes/plan.luau', to: 'renamed.luau' }, 'Renamed');
  h.state.open = 'other.luau';
  h.state.prefix = '';
  resolve({ ok: true, result: { to: 'renamed.luau' } });
  await pending;
  assert.equal(h.state.open, 'other.luau');
  assert.equal(h.state.prefix, '');
  assert.deepEqual(h.requests, ['listing']);
});

test('an unexpected mutation transport rejection clears busy without falsely confirming failure or success', async () => {
  const h = harness({ operation: async () => { throw new Error('auth transport unavailable'); } });
  assert.equal(await h.act({ op: 'delete', path: 'notes/plan.luau' }, 'Moved to the trash'), null);
  assert.equal(h.state.busy, false);
  assert.equal(h.state.open, 'notes/plan.luau');
  assert.match(h.state.notice, /could not be confirmed/i);
});

test('mutation controls remain busy until the post-mutation listing has finished', async () => {
  let finish;
  const h = harness({ listRefresh: () => new Promise((done) => { finish = done; }) });
  const pending = h.act({ op: 'rename', path: 'notes/plan.luau', to: 'renamed.luau' }, 'Renamed');
  await Promise.resolve();
  assert.equal(h.state.busy, true);
  finish();
  await pending;
  assert.equal(h.state.busy, false);
});

test('a confirmed write followed by refresh failure is not reported as an unconfirmed write', async () => {
  const h = harness({ listRefresh: async () => { throw new Error('refresh transport failed'); } });
  await h.act({ op: 'rename', path: 'notes/plan.luau', to: 'renamed.luau' }, 'Renamed');
  assert.equal(h.state.open, 'renamed.luau');
  assert.equal(h.state.busy, false);
  assert.match(h.state.notice, /change was saved/i);
  assert.doesNotMatch(h.state.notice, /could not be confirmed/i);
});

test('a known refusal survives a subsequent listing refresh failure', async () => {
  async function observed(source) {
    const h = harness({ source,
      result: { ok: false, code: 'occupied', error: 'That path already exists.' },
      listRefresh: async () => { throw new Error('refresh failed'); },
    });
    await h.act({ op: 'rename', path: 'notes/plan.luau', to: 'taken.luau' }, 'Renamed');
    assert.equal(h.state.busy, false);
    assert.equal(h.state.open, 'notes/plan.luau');
    assert.match(h.state.notice, /That path already exists/);
    assert.match(h.state.notice, /could not be refreshed/);
    assert.doesNotMatch(h.state.notice, /could not be confirmed/);
  }
  await observed(panel);
  const remembered = 'refusal = refusalCopy(res.code, res.error);';
  assert.equal(panel.split(remembered).length - 1, 1);
  await assert.rejects(observed(panel.replace(remembered, 'refusalCopy(res.code, res.error);')), { name: 'AssertionError' });
});
