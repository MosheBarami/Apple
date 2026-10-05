/**
 * THE PROJECT'S HISTORY: ITS REAL CHECKPOINTS, GROUPED BY THE REQUEST THAT MADE THEM (M2 step 2.3, item C5).
 *
 * The API returns, for each checkpoint, an id, a label, a kind, a time, counts, coverage, an author and a description, and NO request id
 * (apps/worker/src/do/session.ts, GET /checkpoints). So the grouping is by time and it is held to say only what time can say:
 *
 *   1. A checkpoint StudPilot took (kind `auto` or `pre_agent`) is filed under the latest request the person had sent when it was taken.
 *   2. A checkpoint the person saved by hand was NOT made by a request, and is never filed under one: it has its own group.
 *   3. A checkpoint older than every request loaded is "Earlier work", not the first request's.
 *   4. Nothing is invented: a request that made no checkpoint is not listed, and every row is a checkpoint the API returned.
 *   5. The rows are the drawer's rows (author, date, counts, description, Restore, the restore's own sentence), rendered and run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import { findAll, loadPage, textOf } from './page-harness.mjs';
import { REQUEST_SHOWN, groupCheckpointsByRequest, requestHeading, requestsFromMessages } from '../src/lib/checkpoint-history.ts';

const T = 1_700_000_000_000;
const cp = (id, at, kind = 'pre_agent', extra = {}) => ({ id, label: `cp ${id}`, createdAt: T + at, kind, scriptCount: 2, instanceCount: 40, sizeBytes: 100, ...extra });
const req = (id, at, content = `request ${id}`) => ({ id, role: 'user', content, createdAt: T + at });

/* ------------------------------------------------------------------ the grouping --- */

test('a checkpoint StudPilot took is filed under the latest request sent before it', () => {
  const groups = groupCheckpointsByRequest(
    [cp('a', 1_000), cp('b', 5_000), cp('c', 9_000, 'auto'), cp('d', 12_000)],
    requestsFromMessages([req('r1', 500), req('r2', 4_000), req('r3', 11_000)]),
  );
  assert.deepEqual(groups.map((g) => [g.kind, g.request?.id, g.checkpoints.map((c) => c.id)]), [
    ['request', 'r3', ['d']],
    ['request', 'r2', ['c', 'b']],
    ['request', 'r1', ['a']],
  ]);
});

test('a checkpoint taken at the very moment of a request belongs to it (the run that request started)', () => {
  const [group] = groupCheckpointsByRequest([cp('a', 4_000)], requestsFromMessages([req('r1', 0), req('r2', 4_000)]));
  assert.equal(group.request.id, 'r2');
});

test('groups run newest request first, and a group lists its checkpoints newest first, whatever order they arrive in', () => {
  const groups = groupCheckpointsByRequest([cp('x', 1_000), cp('z', 3_000), cp('y', 2_000)], requestsFromMessages([req('r1', 0)]));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].checkpoints.map((c) => c.id), ['z', 'y', 'x']);
  // And the requests may arrive in any order too.
  const shuffled = groupCheckpointsByRequest([cp('a', 1_000), cp('b', 9_000)], [{ id: 'late', text: 'late', at: T + 8_000 }, { id: 'early', text: 'early', at: T }]);
  assert.deepEqual(shuffled.map((g) => g.request.id), ['late', 'early']);
});

test('A CHECKPOINT SAVED BY HAND IS NOT A REQUEST’S: it has its own group, however it falls between two requests', () => {
  const groups = groupCheckpointsByRequest(
    [cp('m1', 2_000, 'manual'), cp('a', 3_000), cp('m2', 8_000, 'manual')],
    requestsFromMessages([req('r1', 1_000), req('r2', 5_000)]),
  );
  assert.deepEqual(groups.map((g) => [g.kind, g.checkpoints.map((c) => c.id)]), [['request', ['a']], ['saved', ['m2', 'm1']]]);
  assert.equal(groups.some((g) => g.kind === 'request' && g.checkpoints.some((c) => c.kind === 'manual')), false, 'a manual checkpoint under a request');
});

test('a checkpoint older than every request loaded is "Earlier work", not the first request’s', () => {
  const groups = groupCheckpointsByRequest([cp('old', 100), cp('new', 2_000)], requestsFromMessages([req('r1', 1_000)]));
  assert.deepEqual(groups.map((g) => [g.kind, g.checkpoints.map((c) => c.id)]), [['request', ['new']], ['earlier', ['old']]]);
  const none = groupCheckpointsByRequest([cp('a', 1)], []);
  assert.deepEqual(none.map((g) => g.kind), ['earlier'], 'with no request loaded at all, everything is earlier work');
});

test('NOTHING IS INVENTED: a request that made no checkpoint is not listed, and no checkpoint is dropped or repeated', () => {
  const checkpoints = [cp('a', 1_000), cp('b', 6_000, 'manual'), cp('c', 7_000), cp('d', 50)];
  const groups = groupCheckpointsByRequest(checkpoints, requestsFromMessages([req('r1', 0), req('r-none', 3_000), req('r2', 6_500)]));
  assert.equal(groups.some((g) => g.request?.id === 'r-none'), false, 'a request with no checkpoint is listed');
  const listed = groups.flatMap((g) => g.checkpoints.map((c) => c.id)).sort();
  assert.deepEqual(listed, ['a', 'b', 'c', 'd'], 'every checkpoint, once');
  assert.deepEqual(groupCheckpointsByRequest([], requestsFromMessages([req('r1', 0)])), [], 'no checkpoints, no groups');
});

test('the inputs are not changed', () => {
  const checkpoints = [cp('b', 2_000), cp('a', 1_000)];
  const requests = [{ id: 'r', text: 'r', at: T }];
  const before = JSON.stringify([checkpoints, requests]);
  groupCheckpointsByRequest(checkpoints, requests);
  assert.equal(JSON.stringify([checkpoints, requests]), before);
});

/* ------------------------------------------------------------------ the requests --- */

test('requests are the person’s own messages only, oldest first, and a message without a time is not one', () => {
  const marks = requestsFromMessages([
    { id: 'a2', role: 'assistant', content: 'done', createdAt: T + 2 },
    req('u2', 20),
    req('u1', 10),
    { id: 'bad', role: 'user', content: 'no time', createdAt: Number.NaN },
  ]);
  assert.deepEqual(marks.map((m) => m.id), ['u1', 'u2']);
});

test('a request’s heading is its first line, cut at a word when it is long, and never empty text invented', () => {
  assert.equal(requestHeading('Build a lava obby\nwith checkpoints'), 'Build a lava obby');
  assert.equal(requestHeading('  \n\n  second   line   here  '), 'second line here');
  assert.equal(requestHeading(''), '');
  const long = `${'word '.repeat(60)}end`;
  const cut = requestHeading(long);
  assert.ok(cut.length <= REQUEST_SHOWN + 1, `${cut.length}`);
  assert.ok(cut.endsWith('…'));
  assert.doesNotMatch(cut, /wor…$/, 'cut at a word, not in the middle of one');
  const exact = 'x'.repeat(REQUEST_SHOWN);
  assert.equal(requestHeading(exact), exact, 'a line that fits is not cut');
});

/* ------------------------------------------------------------------ the rows, rendered --- */

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { CheckpointHistory, HISTORY_NOTE } from './src/components/ws/checkpoint-history';
`, { name: 'checkpoint-history', resolveDir: WEB });
const render = (props) => renderWith(ui.renderToStaticMarkup, ui.h(ui.CheckpointHistory, {
  groups: [], userId: 'me', memberNames: {}, restoreStatus: null, restoreBusy: false, studioConnected: true, onRestore() {}, ...props,
}));

const groups = groupCheckpointsByRequest(
  [cp('a', 1_000, 'pre_agent', { description: 'Before the lava was added.', authorId: null }), cp('m', 2_000, 'manual', { authorId: 'me', label: 'my save' }), cp('o', 10, 'auto')],
  requestsFromMessages([req('r1', 500, 'Build a lava obby with three stages')]),
);

test('each group has a heading: the request in words with its time, or "Saved by you", or "Earlier work"', () => {
  const html = render({ groups });
  const headings = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].map((m) => text(m[1]));
  assert.equal(headings.length, 3);
  assert.match(headings[0], /^Build a lava obby with three stages/);
  assert.equal(headings[1], 'Earlier work');
  assert.equal(headings[2], 'Saved by you');
  assert.match(html, /<time[^>]*dateTime="2023-11-14T22:13:20\.500Z"/, 'the request’s time is a real time element, at the time the request carries');
  assert.equal((html.match(/<section class="gx-history__group" aria-labelledby=/g) ?? []).length, 3, 'each group is a labelled region');
});

test('each row says who took it, when, what it holds, the authored sentence, and offers Restore', () => {
  const html = render({ groups });
  const row = element(html, /<div class="gx-row"[^>]*>(?=[\s\S]{0,40}cp a)/);
  assert.ok(row, 'the pre_agent row');
  assert.match(text(row), /StudPilot ·/, 'who: StudPilot took an automatic one');
  assert.match(text(row), /40 objects · 2 scripts/);
  assert.match(text(row), /Before the lava was added\./, 'the authored sentence is on the row, verbatim');
  assert.match(row, /<button[^>]*>Restore<\/button>/);
  assert.match(text(html), /You ·/, 'a manual checkpoint of the viewer reads "You"');
});

test('Restore is held while Studio is not connected or a restore is running, and says Restoring on the one that is', () => {
  const off = render({ groups, studioConnected: false });
  assert.equal((off.match(/<button[^>]*disabled=""[^>]*>Restore<\/button>/g) ?? []).length, 3, 'every Restore is held without Studio');
  const status = { type: 'restore_status', checkpointId: 'a', phase: 'applying' };
  const busy = render({ groups, restoreBusy: true, restoreStatus: status });
  assert.equal((busy.match(/disabled=""/g) ?? []).length, 3);
  assert.match(busy, /<button[^>]*>Restoring…<\/button>/);
  assert.equal((busy.match(/Restoring…/g) ?? []).length, 1, 'only the checkpoint being restored says so');
});

test('the restore’s own sentence and the counts of what came back sit under the checkpoint they belong to, and under no other', () => {
  const html = render({ groups, restoreStatus: { type: 'restore_status', checkpointId: 'm', phase: 'reading' } });
  const mine = element(html, /<div class="gx-row"[^>]*>(?=[\s\S]{0,40}my save)/);
  assert.match(mine, /gx-restore is-working/);
  assert.match(text(mine), /Reading the checkpoint…/, 'the sentence is on the row, not only its class');
  assert.equal((html.match(/gx-restore /g) ?? []).length, 1, 'exactly one row carries a restore status');
  const done = render({ groups, restoreStatus: { type: 'restore_status', checkpointId: 'a', phase: 'done', fidelity: { instancesCreated: 12, scriptsRestored: 3, scriptsExpected: 4, failedInstances: 0, failedScripts: 1, failedProperties: 0 } } });
  const row = element(done, /<div class="gx-row"[^>]*>(?=[\s\S]{0,40}cp a)/);
  assert.match(text(row), /Restored\./);
  assert.match(text(row), /12 objects · 3\/4 scripts · 1 scripts failed/, 'what actually came back, as the plugin counted it');
});

/* ------------------------------------------------------------------ the press, run --- */

const Page = await loadPage({
  entry: 'src/components/ws/checkpoint-history.tsx',
  name: 'checkpoint-history-page',
  real: ['lib/checkpoint-author.ts'],
  fakes: { 'lib/format.ts': { clockTime: '() => "t"', fullStamp: '() => "full"', formatSettings: '() => ({ locale: "en" })' } },
});

test('pressing Restore hands the page THAT checkpoint, and the component restores nothing itself', () => {
  const pressed = [];
  const tree = Page.CheckpointHistory({ groups, userId: 'me', memberNames: {}, restoreStatus: null, restoreBusy: false, studioConnected: true, onRestore: (c) => pressed.push(c.id) });
  const buttons = findAll(tree, (n) => n.type === 'button' && textOf(n) === 'Restore');
  assert.equal(buttons.length, 0, 'rows are components in the stub renderer: the buttons are one level down');
  const rows = findAll(tree, (n) => n.props?.c !== undefined);
  assert.deepEqual(rows.map((r) => r.props.c.id), ['a', 'o', 'm'], 'one row per checkpoint, in group order');
  for (const row of rows) assert.equal(typeof row.props.onRestore, 'function');
  rows[1].props.onRestore(rows[1].props.c);
  assert.deepEqual(pressed, ['o']);
});

/* ------------------------------------------------------------------ the page (source) --- */

const ws = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');

test('the workspace builds the history from the checkpoints the socket holds and the conversation it holds, and mounts the component', () => {
  assert.match(ws, /groupCheckpointsByRequest\(checkpoints, requestsFromMessages\(messages\)\)/);
  assert.match(ws, /<CheckpointHistory\s+groups=\{historyGroups\}/);
  assert.match(ws, /restoreCheckpoint\(c\.id\)/);
  assert.doesNotMatch(ws, /checkpoints\.map\(/, 'the drawer still draws the checkpoints as one flat list');
});

test('the history uses only fields the API returns', () => {
  const shared = readFileSync(join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const meta = /export interface CheckpointMeta \{([\s\S]*?)\n\}/.exec(shared)?.[1] ?? '';
  const returned = new Set([...meta.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]));
  assert.ok(returned.size >= 8, `read ${returned.size} fields: the check below would be vacuous`);
  const model = readFileSync(join(WEB, 'src', 'lib', 'checkpoint-history.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, '');
  const row = readFileSync(join(WEB, 'src', 'components', 'ws', 'checkpoint-history.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/^\s*\/\/.*$/gm, '');
  for (const [where, src] of [['model', model], ['row', row]]) {
    const used = [...src.matchAll(/\b(?:c|checkpoint)\.(\w+)/g)].map((m) => m[1]);
    assert.ok(used.length > 0, `${where}: no checkpoint field is read, so the check is vacuous`);
    for (const field of used) assert.ok(returned.has(field), `${where} reads checkpoint.${field}, which the API does not return`);
  }
});
