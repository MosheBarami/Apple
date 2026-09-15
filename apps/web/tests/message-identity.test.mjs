// Which id the client holds for a message the USER sent.
//
// THE BUG THIS EXISTS TO CLOSE, and it is not a small one. The client appends its own message
// optimistically under a locally minted id, because the send is fire-and-forget over the socket
// and the message has to appear immediately. The server inserts its own row under its own uuid and
// never told anyone what it was: `msg_start` carried the ASSISTANT message's id and nothing else.
//
// So every user message sent in the current session carried an id no server had ever heard of, and
// every feature keyed on that id silently failed the moment it was used on a fresh message:
//
//   * Edit this message → "That message is no longer in the conversation."
//   * Try again after a failure → the same, from the same lookup.
//   * Regenerate → the same, and this is its MOST common case: send a prompt, read the reply,
//     ask for another take, all without reloading the page.
//
// Reloading the page fixed all three, because history comes back from /messages with real ids —
// which is exactly what makes it the kind of bug that survives a demo.
//
// The fix is one optional field on a message the server already broadcasts, and one reconciliation
// step on the client. The reconciliation is the part with the sharp edges, so it is a pure
// function and it is tested here rather than asserted at from a distance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCAL_ID_PREFIX, isLocalId, localId, adoptUserMessageId } from '../src/lib/message-identity.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const REPO = join(WEB, '..', '..');
const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
const SESSION = readFileSync(join(REPO, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8');
const SHARED = readFileSync(join(REPO, 'packages', 'shared', 'src', 'index.ts'), 'utf8');

// ------------------------------------------------------------- what a local id is ---

test('a locally minted id is recognisable as one', () => {
  // The whole reconciliation turns on telling "mine" from "the server's". One definition of the
  // prefix, in the module that mints it — two would drift and the drift is invisible.
  assert.ok(isLocalId(localId()));
  assert.ok(isLocalId(`${LOCAL_ID_PREFIX}whatever`));
  assert.equal(isLocalId('9f1c2b7e-0000-4000-8000-000000000000'), false);
});

test('two ids minted in the same millisecond still differ', () => {
  // They are React list keys. A duplicate key silently renders one of two messages.
  assert.notEqual(localId(), localId());
});

// ------------------------------------------------------------------- adoption ---

const user = (id) => ({ id, role: 'user', content: 'x' });
const bot = (id) => ({ id, role: 'assistant', content: 'y' });

test('the message just sent takes the id the server gave it', () => {
  const list = [user('real-1'), bot('real-2'), user(`${LOCAL_ID_PREFIX}9`)];
  assert.deepEqual(adoptUserMessageId(list, 'srv-7').map((m) => m.id), ['real-1', 'real-2', 'srv-7']);
});

test('only the LAST unresolved user message is adopted', () => {
  // Two locals can coexist for a moment — an edit appends one while an earlier send has not been
  // named yet. Renaming the older one attaches this run's id to the wrong message, and the next
  // edit then truncates from the wrong place.
  const list = [user(`${LOCAL_ID_PREFIX}1`), bot('real-2'), user(`${LOCAL_ID_PREFIX}2`)];
  assert.deepEqual(adoptUserMessageId(list, 'srv-7').map((m) => m.id), [`${LOCAL_ID_PREFIX}1`, 'real-2', 'srv-7']);
});

test('an assistant message is never adopted, however local its id looks', () => {
  // The server names the user row here. Attaching it to a reply would point Edit at a message the
  // server refuses to edit at all.
  const list = [bot(`${LOCAL_ID_PREFIX}1`)];
  assert.deepEqual(adoptUserMessageId(list, 'srv-7'), list);
});

test('a message that already has a real id is left alone', () => {
  // A run started from history — or a second msg_start for the same run — must not renumber a row
  // whose id is already the server's.
  const list = [user('real-1')];
  assert.deepEqual(adoptUserMessageId(list, 'srv-7'), list);
});

test('the same id is never given to two messages', () => {
  // msg_start can arrive twice for one run across a reconnect. A duplicate id is a duplicate React
  // key AND an Edit that could truncate from either of two places.
  const list = [user('srv-7'), bot('real-2'), user(`${LOCAL_ID_PREFIX}9`)];
  assert.deepEqual(adoptUserMessageId(list, 'srv-7'), list);
});

test('nothing to adopt returns the SAME array, not a copy', () => {
  // It runs inside a setState on every msg_start. Returning a fresh array every time repaints the
  // whole conversation for nothing.
  const list = [user('real-1')];
  assert.equal(adoptUserMessageId(list, 'srv-7'), list);
});

test('an empty or missing server id changes nothing', () => {
  // An older worker sends no userMsgId at all. The absence must be inert, not a crash and not an
  // id of ''.
  const list = [user(`${LOCAL_ID_PREFIX}9`)];
  assert.equal(adoptUserMessageId(list, ''), list);
  assert.equal(adoptUserMessageId(list, undefined), list);
});

// --------------------------------------------------------------------- wiring ---

test('the server names the user row on the message it already sends', () => {
  // Not a new ServerMsg: msg_start is broadcast exactly once per run, after the user row is
  // inserted, and already carries the run's other id.
  assert.match(SESSION, /type: 'msg_start', msgId, role: 'assistant', mode, userMsgId/);
});

test('the field is optional on the wire, because the worker and the app deploy separately', () => {
  // A web build that requires it would be describing a worker that may not be live yet.
  assert.match(SHARED, /\{ type: 'msg_start'; msgId: string; role: 'assistant'; mode: GolemMode; userMsgId\?: string \}/);
});

test('the client adopts it, and mints its local ids from the one module that defines them', () => {
  assert.match(SOCKET, /const list = adoptUserMessageId\(raw, msg\.userMsgId\)/);
  assert.match(SOCKET, /from '\.\/message-identity'/);
  assert.equal(/const localId = \(\) =>/.test(SOCKET), false, 'no second definition of a local id');
});
