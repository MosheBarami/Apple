// Editing an earlier prompt and running again from it.
//
// This is the most destructive thing the workspace can do short of deleting the project: it drops
// every message from the edited one onward, permanently, and starts a fresh run. Every test here
// covers a way that goes wrong quietly — a truncation the other tab never hears about, a stale
// client id that would truncate from the beginning, or a rewrite of what Apple said.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const REPO = join(WORKER, '..', '..');
const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
const SHARED = readFileSync(join(REPO, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
const handler = SESSION.slice(SESSION.indexOf("case 'edit_resend'"), SESSION.indexOf("case 'stop': {"));

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = stripComments(handler);

// -------------------------------------------------------- refuse before destroy ---

test('an edit during a run is refused', () => {
  // A run holds a copy of the agent blob for the length of a step and writes it back at the tail.
  // Deleting the messages it is narrating leaves a run describing a conversation that is gone.
  assert.match(code, /agent && agent\.status !== 'idle'/);
  assert.ok(code.indexOf("status !== 'idle'") < code.indexOf('delete from messages'), 'refuse before deleting');
});

test('a message id that is no longer there is refused, not treated as "from the start"', () => {
  // A tab left open across an earlier truncation will ask to edit a row that is already gone. If
  // the lookup silently produced no row and the delete ran anyway, the predicate would match
  // everything.
  assert.match(code, /if \(!row\)/);
  assert.ok(code.indexOf('if (!row)') < code.indexOf('delete from messages'));
});

test('only the user\'s own messages can be edited', () => {
  // Editing what Apple said and replaying from there would let the transcript assert the assistant
  // produced text it never produced.
  assert.match(code, /row\.role !== 'user'/);
  assert.ok(code.indexOf("row.role !== 'user'") < code.indexOf('delete from messages'));
});

test('an edit to nothing is refused rather than starting an empty run', () => {
  assert.match(code, /if \(!text\)/);
  assert.ok(code.indexOf('if (!text)') < code.indexOf('delete from messages'));
});

test('every refusal tells the user which one it was', () => {
  // One generic "could not edit" for four different causes leaves the user guessing which.
  const messages = [...code.matchAll(/message: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(messages.length >= 4, `expected a distinct message per refusal, got ${messages.length}`);
  assert.equal(new Set(messages).size, messages.length, 'the refusals must not share wording');
});

// ------------------------------------------------------------- the truncation ---

test('the cut is by time, from the edited message inclusive', () => {
  assert.match(code, /delete from messages where created_at >= \?/);
  assert.match(code, /row\.created_at/);
});

test('the removed count is taken BEFORE the delete', () => {
  // Afterwards there is nothing left to count, and "removed: 0" appearing as forty messages vanish
  // is worse than no number at all.
  assert.ok(
    code.indexOf('select count(*) as n from messages') < code.indexOf('delete from messages'),
    'count first, then delete',
  );
});

test('the truncation is broadcast to every client, not just the one that asked', () => {
  // A second tab would otherwise keep rendering messages the server has deleted, and nothing tells
  // that stale view apart from a live one.
  assert.match(code, /this\.broadcast\(\{ type: 'history_truncated'/);
  assert.match(code, /fromMessageId: row\.id, removed/);
});

test('the new run starts only after the history is cut', () => {
  // The other order appends the new message and then deletes a range that includes it.
  assert.ok(code.indexOf('delete from messages') < code.indexOf('this.startRun'), 'truncate, then run');
});

test('the edited text is capped like any other prompt', () => {
  // Was pinned to the literal 8000. The cap is now the shared MESSAGE_MAX_CHARS constant, which is
  // better code and broke a test about the CAP for a reason about its spelling. Assert both halves:
  // the edit path slices by the constant, and the constant is still 8000.
  assert.match(code, /msg\.text\.slice\(0, MESSAGE_MAX_CHARS\)/);
  const shared = readFileSync(join(REPO, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  assert.match(shared, /export const MESSAGE_MAX_CHARS = 8000;/);
});

// ----------------------------------------------------------------- the protocol ---

test('both messages are in the shared protocol', () => {
  assert.match(SHARED, /\| \{ type: 'edit_resend'; messageId: string; text: string; mode: GolemMode; productModel\?: ProductModel \}/);
  assert.match(SHARED, /\| \{ type: 'history_truncated'; fromMessageId: string; removed: number \}/);
});

test('the protocol states that the build is not rewound', () => {
  // The assumption a user makes here is that editing undoes what was built. It does not, and the
  // place that defines the message is where that has to be recorded so it survives a rewrite.
  const doc = SHARED.slice(SHARED.indexOf('Correct an earlier prompt'), SHARED.indexOf("type: 'edit_resend'"));
  assert.match(doc, /does NOT undo/i);
  assert.match(doc, /[Cc]heckpoints/);
});

// ------------------------------------------------------------------ the client ---

const WEB = join(REPO, 'apps', 'web');
const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
const DIALOG = readFileSync(join(WEB, 'src', 'components', 'ws', 'edit-message-dialog.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');

test('the client drops the truncated messages when told to', () => {
  // Keeping them means every later index is wrong — the "last assistant" the phase marks attach
  // to, most of all.
  const c = SOCKET.slice(SOCKET.indexOf("case 'history_truncated'"), SOCKET.indexOf("case 'msg_end'"));
  assert.match(c, /list\.findIndex\(\(m\) => m\.id === msg\.fromMessageId\)/);
  assert.match(c, /list\.slice\(0, idx\)/);
  assert.match(c, /idx === -1 \? list/, 'an unknown id must change nothing rather than clear everything');
});

test('the optimistic update matches what the server will do', () => {
  // Otherwise the old messages sit there through the round trip and the user cannot tell whether
  // the edit took.
  const fn = SOCKET.slice(SOCKET.indexOf('const editAndResend'), SOCKET.indexOf('const sendChat'));
  assert.match(fn, /list\.slice\(0, idx\)/);
  assert.match(fn, /role: 'user'/);
});

test('the dialog says how much is discarded, as a number', () => {
  // "Later messages" reads as two or three. Forty-seven does not.
  assert.match(DIALOG, /\{discards\}/);
  assert.match(DIALOG, /cannot be undone/);
  assert.match(WS, /messages\.length - messages\.findIndex\(\(m\) => m\.id === editing\.id\) - 1/);
});

test('the dialog says the build is NOT rewound', () => {
  // The assumption people arrive with, stated before they act rather than discovered after.
  assert.match(DIALOG, /rewinds the\s*\n?\s*conversation, not the work/);
  assert.match(DIALOG, /checkpoint/i);
});

test('an unchanged message cannot be "edited"', () => {
  // Confirming a no-op would still discard everything after it.
  assert.match(DIALOG, /trimmed !== current\.trim\(\)/);
  assert.match(DIALOG, /disabled=\{!changed \|\| busy\}/);
});

test('the edit control is absent while a run is in flight', () => {
  // The server refuses it, and a control that is always present but sometimes refuses is worse
  // than one that is only present when it works. Access can also be revoked while this page is
  // open, so all three facts belong to the offer: own message, no run, chat still allowed.
  const assertEditGate = (src) => {
    const match = /editable=\{([^}]*)\}/.exec(src);
    assert.ok(match, 'the Turn edit gate must still be wired');
    const gate = match[1];
    assert.match(gate, /item\.role === 'user'/, 'only the user\'s own message may be edited');
    assert.match(gate, /!running/, 'the edit offer must disappear while a run is active');
    assert.match(gate, /\bchatAllowed\b/, 'revoked chat permission must remove the edit offer too');
  };
  assertEditGate(WS);

  // Falsification: a guard that only checked the old role/run pair would stay green after access
  // revocation support was accidentally dropped. Removing that one conjunct must make this guard red.
  assert.throws(
    () => assertEditGate(WS.replace(/\s*&&\s*chatAllowed(?=\})/, '')),
    /chat permission/,
  );
});
