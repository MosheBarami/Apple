import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { uploadCheck, looksBinary, replaceConfirm, refusalCopy } from '../src/components/ws/files-model.ts';

const source = readFileSync(new URL('../src/components/ws/files-panel.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('files-panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Execute the shipping callbacks, not a copy of their implementation. QueryObserver below is the
// installed query library: by default a failed refetch RESOLVES, so a rejecting stub is insufficient.
function callback(name, deps) {
  const matches = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name
      && node.initializer && ts.isCallExpression(node.initializer)) matches.push(node.initializer.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.equal(matches.length, 1, `expected one production ${name} callback`);
  const js = ts.transpileModule(`const run = ${matches[0].getText(tree)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return new Function(...Object.keys(deps), `${js}\nreturn run;`)(...Object.values(deps));
}

const limits = { maxFileBytes: 49152, maxVersions: 20, trashDays: 30, extensions: ['.md', '.luau'] };
const ok = { ok: true, result: {} };
const occupied = { ok: false, code: 'occupied', error: 'That path already exists.' };

function uploadHarness(options = {}) {
  const state = { busy: false, notice: null };
  const calls = { upload: [], confirm: [], busy: [], refresh: 0, read: 0 };
  const add = callback('addFile', {
    setNotice: value => { state.notice = value; },
    uploadCheck, looksBinary, replaceConfirm, refusalCopy,
    setBusy: value => { state.busy = value; calls.busy.push(value); },
    uploadProjectFile: async (...args) => {
      calls.upload.push(args);
      return options.upload ? options.upload(calls.upload.length, args) : ok;
    },
    projectId: 'owned-project',
    window: { confirm: question => { calls.confirm.push(question); return options.confirm === true; } },
    refresh: async () => { calls.refresh += 1; if (options.refresh) await options.refresh(); },
  });
  const picked = {
    name: options.name ?? 'proof.luau', size: options.size ?? 24,
    async text() {
      calls.read += 1;
      return options.read ? options.read() : 'return { ok = true }';
    },
  };
  return { run: () => add(picked, limits, 'notes'), state, calls };
}

test('upload transport rejection is contained without a false save or automatic retry', async () => {
  const h = uploadHarness({ upload: async () => { throw new Error('interrupted'); } });
  await assert.doesNotReject(h.run());
  assert.equal(h.state.busy, false);
  assert.match(h.state.notice, /upload could not be confirmed/i);
  assert.equal(h.calls.upload.length, 1);
  assert.equal(h.calls.refresh, 0);
});

test('a rejected approved overwrite releases busy without silently retrying', async () => {
  const h = uploadHarness({ confirm: true, upload: async n => {
    if (n === 1) return occupied;
    throw new Error('overwrite interrupted');
  } });
  await assert.doesNotReject(h.run());
  assert.equal(h.state.busy, false);
  assert.match(h.state.notice, /could not be confirmed/i);
  assert.equal(h.calls.upload.length, 2);
  assert.deepEqual(h.calls.upload[1][3], { overwrite: true });
});

test('upload busy remains set until the acknowledged save refresh completes', async () => {
  let finish, entered;
  const reached = new Promise(resolve => { entered = resolve; });
  const waiting = new Promise(resolve => { finish = resolve; });
  const h = uploadHarness({ refresh: async () => { entered(); await waiting; } });
  const pending = h.run();
  await reached;
  try { assert.equal(h.state.busy, true); }
  finally { finish(); await pending; }
  assert.equal(h.state.busy, false);
});

test('an acknowledged save followed by refresh rejection remains an acknowledged save', async () => {
  const h = uploadHarness({ refresh: async () => { throw new Error('refresh interrupted'); } });
  await assert.doesNotReject(h.run());
  assert.equal(h.state.busy, false);
  assert.match(h.state.notice, /file was saved/i);
  assert.doesNotMatch(h.state.notice, /upload could not be confirmed/i);
  assert.equal(h.calls.upload.length, 1);
});

test('unreadable local content is refused before upload', async () => {
  const h = uploadHarness({ read: async () => { throw new Error('disk read failed'); } });
  await h.run();
  assert.equal(h.state.notice, 'That file could not be read.');
  assert.equal(h.state.busy, false);
  assert.equal(h.calls.upload.length, 0);
});

test('binary content is never sent even with an allowed filename', async () => {
  const h = uploadHarness({ read: async () => 'PK\u0000binary' });
  await h.run();
  assert.match(h.state.notice, /not text/i);
  assert.equal(h.state.busy, false);
  assert.equal(h.calls.upload.length, 0);
});

test('size validation occurs before reading local bytes or starting a write', async () => {
  const h = uploadHarness({ size: limits.maxFileBytes + 1 });
  await h.run();
  assert.match(h.state.notice, /48/);
  assert.equal(h.calls.read, 0);
  assert.deepEqual(h.calls.busy, []);
  assert.equal(h.calls.upload.length, 0);
});

test('an acknowledged server refusal retains its specific explanation', async () => {
  const h = uploadHarness({ upload: async () => ({ ok: false, code: 'future-refusal', error: 'Project storage is full.' }) });
  await h.run();
  assert.equal(h.state.notice, 'Project storage is full.');
  assert.equal(h.state.busy, false);
  assert.equal(h.calls.refresh, 0);
});

test('a successful upload retains the owning project, path and content and refreshes once', async () => {
  const h = uploadHarness();
  await h.run();
  assert.deepEqual(h.calls.upload, [['owned-project', 'notes/proof.luau', 'return { ok = true }']]);
  assert.equal(h.calls.refresh, 1);
  assert.equal(h.state.notice, 'Added notes/proof.luau');
  assert.equal(h.state.busy, false);
});

test('the actual adjusted filename is disclosed', async () => {
  const h = uploadHarness({ name: 'Proof (final).luau' });
  await h.run();
  const actualPath = h.calls.upload[0][1];
  assert.notEqual(actualPath, 'notes/Proof (final).luau');
  assert.equal(h.state.notice, `Added as ${actualPath} — the name was adjusted to fit the workspace.`);
});

for (const confirm of [false, true]) test(`occupied upload preserves explicit overwrite consent: ${confirm}`, async () => {
  const h = uploadHarness({ confirm, upload: async n => n === 1 ? occupied : ok });
  await h.run();
  assert.equal(h.calls.confirm.length, 1);
  assert.equal(h.calls.upload.length, confirm ? 2 : 1);
  assert.equal(h.calls.upload[0][3], undefined);
  if (confirm) assert.deepEqual(h.calls.upload[1][3], { overwrite: true });
  assert.equal(h.calls.refresh, confirm ? 1 : 0);
  assert.equal(h.state.busy, false);
});

function queryHarness(t, { fail = null, open = 'proof.luau', waitForListing } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const calls = [];
  const options = (kind, path = null) => ({
    queryKey: ['files-transfer-proof', kind, path], enabled: false, retry: false,
    queryFn: async () => {
      calls.push([kind, path]);
      if (kind === 'listing' && waitForListing) await waitForListing;
      if (kind === fail) throw new Error(`${kind} failed`);
      return { kind, path };
    },
  });
  const listing = new QueryObserver(client, options('listing'));
  const file = new QueryObserver(client, options('content', open));
  const history = new QueryObserver(client, options('history', open));
  t.after(() => { listing.destroy(); file.destroy(); history.destroy(); client.clear(); });
  const selection = { current: { open, file, history } };
  const refresh = callback('refresh', { listing, file, history, open, selection });
  const select = path => {
    file.setOptions(options('content', path));
    history.setOptions(options('history', path));
    selection.current = { open: path, file, history };
  };
  return { refresh, listing, calls, select };
}

test('installed QueryObserver normally resolves its failed refetch, rather than throwing', async t => {
  const h = queryHarness(t, { fail: 'listing' });
  const result = await h.listing.refetch();
  assert.equal(result.isError, true);
  assert.equal(result.error.message, 'listing failed');
});

for (const fail of ['listing', 'content', 'history']) test(`production refresh reports a real query ${fail} failure`, async t => {
  const h = queryHarness(t, { fail });
  await assert.rejects(h.refresh(), new RegExp(`${fail} failed`));
});

test('refresh rechecks selection after listing yields instead of requesting path=null', async t => {
  let finish;
  const waitForListing = new Promise(resolve => { finish = resolve; });
  const h = queryHarness(t, { waitForListing });
  const pending = h.refresh();
  h.select(null);
  finish();
  await pending;
  assert.deepEqual(h.calls, [['listing', null]]);
});

test('refresh includes the file selected while the listing was loading', async t => {
  let finish;
  const waitForListing = new Promise(resolve => { finish = resolve; });
  const h = queryHarness(t, { open: null, waitForListing });
  const pending = h.refresh();
  h.select('next.luau');
  finish();
  await pending;
  assert.deepEqual(h.calls, [['listing', null], ['content', 'next.luau'], ['history', 'next.luau']]);
});
