// PLUGIN LIFECYCLE — B5 AND B6
//
// B5: `plugin:Unloading` was never handled, and Studio does not kill a plugin's threads when
// it reloads one. The previous script instance kept `connected = true` and kept polling — same
// token, same op queue — while the new instance started a second loop beside it. Each op went
// to whichever polled first, results came back from a script the user believed was gone, and
// F-21's nil recording is that orphaned thread still executing inside `Ops`.
//
// B6: reconnect called `task.cancel(pollThread)`. Cancelling a thread that has already
// finished RAISES, so a reconnect after a 401 threw from the click handler. Worse, the loop is
// usually not sitting in a `task.wait` — it is inside `Ops.execute`, which holds an open
// ChangeHistoryService recording and a relaxed asset policy for the length of an op. Killing it
// there unwinds neither, so every later edit joins one undo entry the user cannot separate.
//
// WHY THESE ARE SOURCE-LEVEL ASSERTIONS. Not because the plugin is a plugin — that reasoning
// was wrong about the Durable Object earlier today and is worth not repeating. It is because
// the behaviour under test is a YIELDING LOOP, and the standalone Luau CLI this repo tests
// Luau with has no `task` library and no scheduler at all: `task.wait`, `task.spawn` and
// `task.cancel` do not exist there, so a loop that yields cannot be run and a shutdown that is
// defined by when a loop next resumes cannot be observed. Stubbing a scheduler would mean
// asserting against a scheduler I wrote, which is how F-30 happened.
//
// So this pins the SHAPE, and the shape is chosen to make the bug hard to write: the loop
// carries its own generation and exits when a newer one exists, which needs no cancellation
// and no thread handle. The module under test is the shipping plugin source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(HERE, '..', '..', '..', 'apps', 'plugin', 'src', 'init.server.luau'), 'utf8');

/** The source with every comment stripped, so an assertion cannot be satisfied by prose. */
const code = source
  .replace(/--\[\[[\s\S]*?\]\]/g, '')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

test('B6 the plugin never cancels a poll thread', () => {
  // The whole of B6 in one line. A comment explaining the old call is fine; a call is not.
  assert.doesNotMatch(code, /task\.cancel/, 'task.cancel must not appear in executable code');
});

test('B6 no thread handle is kept, because there is nothing legitimate to do with one', () => {
  assert.doesNotMatch(code, /pollThread/, 'holding the thread invites cancelling it again');
});

test('B6 the loop carries a generation and stops when a newer one exists', () => {
  // This is what replaces cancellation: the loop retires itself, after finishing whatever op
  // it was in the middle of, which is what lets Ops.execute close its recording.
  assert.match(code, /local function pollLoop\(generation: number\)/, 'the loop must know which generation it is');
  assert.match(
    code,
    /while connected and session and generation == pollGeneration do/,
    'and must exit as soon as it is not the current one',
  );
});

test('B6 starting a poll loop retires the previous one first', () => {
  const startPolling = code.slice(code.indexOf('local function startPolling()'));
  const body = startPolling.slice(0, startPolling.indexOf('\nend'));
  assert.match(body, /stopPolling\(\)/, 'startPolling must retire the previous loop');
  assert.ok(
    body.indexOf('stopPolling()') < body.indexOf('task.spawn'),
    'and must do it before spawning the next, or two loops overlap',
  );
});

test('B6 stopPolling bumps the generation and does nothing else', () => {
  // "Nothing else" is the point: any attempt to force the loop to stop sooner is the bug.
  const stop = code.slice(code.indexOf('local function stopPolling()'));
  const body = stop.slice(0, stop.indexOf('\nend'));
  assert.match(body, /pollGeneration \+= 1/);
  assert.doesNotMatch(body, /task\.|coroutine\./, 'the loop must be left to notice on its own');
});

test('B6 disconnecting retires the loop too', () => {
  const disconnect = code.slice(code.indexOf('local function disconnectSession'));
  const body = disconnect.slice(0, disconnect.indexOf('\nend'));
  assert.match(body, /connected = false/);
  assert.match(body, /pollGeneration \+= 1/, 'a disconnect must retire the loop, not just clear the flag');
});

test('B5 plugin unload is handled', () => {
  assert.match(code, /plugin\.Unloading:Connect/, 'the reload path must be handled at all');
});

test('B5 unloading stops the old instance cooperatively', () => {
  const at = code.indexOf('plugin.Unloading:Connect');
  const body = code.slice(at, code.indexOf('end)', at));
  assert.match(body, /connected = false/, 'the old loop must be told to stop');
  assert.match(body, /pollGeneration \+= 1/, 'and retired');
  assert.doesNotMatch(body, /task\.cancel/, 'but never killed mid-op — that is B6 all over again');
});

test('the poll loop still has exactly one place that decides to keep going', () => {
  // Guards against a future edit adding a second loop, or a nested `while true` that the
  // generation check cannot reach.
  const loops = code.match(/while .* do/g) ?? [];
  const polling = loops.filter((l) => l.includes('connected'));
  assert.equal(polling.length, 1, `expected one polling loop, found ${polling.length}: ${polling.join(' | ')}`);
});
