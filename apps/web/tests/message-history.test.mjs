// Reading what you wrote before you edited it.
//
// The edit dialog says "This discards N later messages… That cannot be undone", and for the replies
// it is still true. What stopped being true is the PROMPT: the words the person typed the first
// time are the one thing in that transaction that cannot be reconstructed from anywhere, and the
// worker now keeps them (apps/worker/tests/message-revisions.test.mjs).
//
// This is the half that makes them reachable. The defects worth guarding are all about a control
// that lies:
//
//   * A MARK ON A MESSAGE THAT HAS NO HISTORY. `revisions` is optional — an older worker sends no
//     field at all — and `undefined` means "nothing known", not "none". Drawing the mark from a
//     falsy check is the same defect either way: an affordance that opens an empty panel.
//   * A PANEL THAT ASKS FOR NOTHING. The text is fetched on demand, so the request has to be tied
//     to the message actually opened, not to the turn that happens to be rendering.
//   * A FAILED FETCH RENDERED AS AN EMPTY HISTORY. "You never edited this" and "we could not read
//     your edits" are different sentences, and only one of them is true.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const REPO = join(WEB, '..', '..');
const TURN = readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
const API = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');
const CSS = readFileSync(join(WEB, 'src', 'styles', 'workspace.css'), 'utf8');
const DIALOG = readFileSync(join(WEB, 'src', 'components', 'ws', 'revisions-dialog.tsx'), 'utf8');
const SHARED = readFileSync(join(REPO, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
/** Statements only. A negative assertion must never run against the prose explaining it — the
 *  comment naturally names the very thing being ruled out. */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DIALOG_CODE = stripComments(DIALOG);

// ------------------------------------------------------------------ the count ---

test('the count travels with the transcript, not one request per turn', () => {
  // Fifty turns would be fifty requests, and the marks would appear one at a time as they landed.
  assert.match(SHARED, /revisions\?: number;/);
  assert.match(SOCKET, /revisions: m\.revisions/);
});

test('an unknown count is not drawn as "no earlier versions"', () => {
  // A worker that predates the feature sends no field. Treating absent as zero is an answer nobody
  // checked, which is the one thing this codebase refuses to render.
  assert.match(TURN, /\(item\.revisions \?\? 0\) > 0/);
});

test('an edit carries the history onto the message that replaces it', () => {
  // The replacement IS the same message, one version later. A count that reset would put an
  // "edited" mark on a message that has just been edited and nowhere else.
  const fn = SOCKET.slice(SOCKET.indexOf('const editAndResend'), SOCKET.indexOf('const sendChat'));
  assert.match(fn, /recordsRevision\(edited\.content, text\)/);
  assert.match(fn, /\(carried \?\? 0\) \+ 1 : carried/);
});

test('a retry is not an edit on the client either, and both sides ask the same function', () => {
  // Try again and Regenerate resend the text verbatim. If the client counted those and the server
  // did not, the mark would appear on a message with nothing behind it.
  assert.match(SHARED, /export function recordsRevision/);
  assert.match(SOCKET, /import \{ recordsRevision \} from '@golem\/shared'/);
});

// ------------------------------------------------------------------ the panel ---

test('the mark is on the user turn, beside Edit, because that is what made it', () => {
  const foot = TURN.slice(TURN.indexOf('gx-user__foot'), TURN.indexOf('</div>\n      </div>\n    );'));
  assert.match(foot, /gx-user__edited/);
  assert.match(foot, /Edited/);
});

test('the earlier versions are fetched for the message that was opened', () => {
  // Tied to the id the dialog was given, and re-read when that id changes — a fetch keyed to the
  // mount alone would show the first message's drafts under the second message's heading.
  assert.match(API, /export const fetchMessageRevisions = \(projectId: string, messageId: string\)/);
  assert.match(DIALOG_CODE, /fetchMessageRevisions\(projectId, messageId\)/);
  assert.match(DIALOG_CODE, /\}, \[projectId, messageId\]\)/);
  assert.match(WS, /messageId=\{revisionsFor\.id\}/);
});

test('a failed read says so rather than rendering an empty history', () => {
  // "You never edited this" and "we could not read your edits" are different sentences and only
  // one of them is true.
  assert.match(DIALOG, /Could not read the earlier versions/);
  // And the failure is a state of its own, not an empty list with a toast somewhere else.
  assert.match(DIALOG, /!failed && revisions !== null/);
});

test('the versions are shown oldest first, with the current text last', () => {
  // A list of drafts with no anchor is unreadable: the point of comparison is what is on screen
  // now, so it has to BE in the list, at the end where it belongs in time. Oldest-first ordering
  // is the DO's (see the worker test); this renders what it is given, unsorted.
  assert.match(DIALOG, /revisions\.map\(/);
  assert.match(DIALOG, /is-current/);
  assert.ok(DIALOG.indexOf('revisions.map(') < DIALOG.indexOf('is-current'), 'current comes last');
  assert.equal(/\.sort\(|reverse\(\)/.test(DIALOG), false, 'not reordered on the way in');
});

test('it is a read-only view — nothing here restores anything', () => {
  // Restoring an old prompt means RE-RUNNING it, which discards the conversation after it. That is
  // the edit dialog, and it asks first and says how many messages it throws away. A "Restore" here
  // would be a second, quieter door into the most destructive action in the workspace.
  assert.equal(/Restore|editAndResend|onRestore/.test(DIALOG_CODE), false);
});

test('the dialog reads the message from the live list, not from a row captured on click', () => {
  // Held as an id: a message that changes underneath the dialog should show what it says now.
  assert.match(WS, /const \[showingRevisions, setShowingRevisions\]/);
  assert.match(WS, /messages\.find\(\(m\) => m\.id === showingRevisions\)/);
});

test('the control has a visible focus state', () => {
  assert.match(CSS, /\.gx-user__edited:focus-visible/);
});
