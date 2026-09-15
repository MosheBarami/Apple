// Keeping what the user wrote before they edited it.
//
// Editing a prompt is the most destructive thing the workspace does short of deleting the project:
// `edit_resend` drops every message from the edited one onward and starts again. Until now it also
// destroyed the ONE thing that could not be reconstructed from anywhere — the words the person
// originally typed. The dialog says "That cannot be undone", and it was telling the truth.
//
// This stores the previous text before the delete runs. Four things carry the risk:
//
//   * ORDER. The capture has to happen before the delete, or there is nothing left to capture.
//   * THE CHAIN MUST FOLLOW THE MESSAGE. The edited message is a NEW row with a new id — the old
//     row is deleted. Revisions left keyed on the dead id are orphans: rows nothing can reach, and
//     an "edited" mark that never appears on the message that was edited.
//   * NOTHING MAY ACCUMULATE UNDER A DEAD ID. Carrying forward without deleting doubles the whole
//     chain on every edit.
//   * AN UNCHANGED RESEND IS NOT AN EDIT. Try again and Regenerate both go through edit_resend
//     with the text untouched, by design — one definition of re-running. If that stored a
//     revision, a user who regenerated four times would be told their message has four earlier
//     versions, all identical to the one on screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordsRevision } from '../../../packages/shared/src/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const REPO = join(WORKER, '..', '..');
const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
const INDEX = readFileSync(join(WORKER, 'src', 'index.ts'), 'utf8');

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const handler = stripComments(SESSION.slice(SESSION.indexOf("case 'edit_resend'"), SESSION.indexOf("case 'stop': {")));
const run = stripComments(SESSION.slice(SESSION.indexOf('private async startRunInner'), SESSION.indexOf('private async startRunInner') + 6000));

// -------------------------------------------------------------------- what counts ---

test('an unchanged resend is not an edit, and both sides ask the same function', () => {
  // Try again and Regenerate resend the prompt verbatim. Four regenerations must not read as four
  // earlier versions of a message that never changed.
  assert.equal(recordsRevision('build me an obby', 'build me an obby'), false);
  assert.equal(recordsRevision('build me an obby', 'build me a tycoon'), true);
});

test('whitespace alone is not a version of anything', () => {
  // The client trims before sending and the server trims on arrival; a rule that disagreed with
  // that would record a revision the user cannot see the difference in.
  assert.equal(recordsRevision('build me an obby', '  build me an obby  '), false);
});

test('an empty previous message is not a version worth keeping', () => {
  assert.equal(recordsRevision('', 'something'), false);
});

// -------------------------------------------------------------------- the schema ---

test('a revision is identified by its message and its place in the chain', () => {
  assert.match(SESSION, /create table if not exists message_revisions\(/);
  assert.match(SESSION, /primary key\(message_id, seq\)/);
});

// ------------------------------------------------------------------ capture order ---

test('the old text is read before the delete, not after', () => {
  // Afterwards there is nothing to read, and the feature would store an empty string forever
  // without ever failing.
  assert.match(handler, /select id, role, content, created_at from messages/);
  assert.ok(
    handler.indexOf('content, created_at from messages') < handler.indexOf('delete from messages'),
    'the old text is in hand before the row is gone',
  );
  // And what is carried onward is that pre-delete snapshot, not a second read of a row that no
  // longer exists — which would silently store an empty string forever without ever failing.
  assert.match(handler, /previous: recordsRevision\(row\.content, text\) \? row\.content : null/);
});

test('the chain follows the message rather than being left on the deleted row', () => {
  // The edited message is a new row with a new id. Revisions keyed on the old id are unreachable,
  // so the "edited" mark would never appear on the message that was actually edited.
  assert.match(run, /carryRevisionsFrom/);
  assert.match(run, /insert into message_revisions/);
  assert.match(run, /select \?, seq, content, created_at from message_revisions where message_id = \?/);
});

test('nothing is left accumulating under an id no message has', () => {
  assert.match(run, /delete from message_revisions where message_id = \?/);
  assert.ok(
    run.indexOf('insert into message_revisions') < run.indexOf('delete from message_revisions'),
    'copy forward, then drop the old chain — the other order loses the history',
  );
});

test('the seq continues the chain rather than restarting it', () => {
  // Restarting at 0 collides with the rows just carried forward, and the primary key turns a lost
  // revision into a thrown exception in the middle of a run.
  assert.match(run, /coalesce\(max\(seq\), -1\) \+ 1/);
});

// -------------------------------------------------------------------- reading them ---

test('the message list says how many earlier versions each message has', () => {
  // Otherwise the conversation needs one request per turn to find out whether to draw the mark,
  // and it draws nothing until they all land.
  const messages = SESSION.slice(SESSION.indexOf("if (path === '/messages'"), SESSION.indexOf("if (path === '/memory'"));
  assert.match(messages, /message_revisions/);
  assert.match(messages, /revisions/);
});

test('the revisions themselves are served, oldest first', () => {
  const branch = SESSION.slice(SESSION.indexOf("path === '/message-revisions'"));
  assert.ok(branch.length > 0, 'the DO serves them');
  assert.match(branch.slice(0, 900), /order by seq asc/);
});

test('the route is gated before it is served', () => {
  // These are a person's own words. A reader that skipped the check would hand them to any
  // signed-in caller who could guess a project id.
  const at = INDEX.indexOf("app.get('/api/shared/:id/messages/:messageId/revisions'");
  assert.notEqual(at, -1, 'the route exists');
  const body = INDEX.slice(at, at + 700);
  assert.match(body, /sharedAccess\(c, c\.req\.param\('id'\) \?\? '', 'read'\)/);
  assert.ok(body.indexOf('sharedAccess') < body.indexOf('stub.fetch'), 'resolved before it is served');
});

test('there is one way to read a conversation, and revisions use it', () => {
  // The transcript itself moved off the owner-only path so a collaborator does not open a shared
  // project to an empty history (see lib/api.ts). An owner-only revisions route would put the
  // "edited" mark on a turn whose panel 404s for exactly those users.
  assert.equal(INDEX.includes("'/api/projects/:id/messages/:messageId/revisions'"), false);
  const shared = INDEX.indexOf("app.get('/api/shared/:id/messages/:messageId/revisions'");
  const messages = INDEX.indexOf("app.get('/api/shared/:id/messages'");
  assert.ok(shared > 0 && messages > 0, 'both reads are on the shared path');
});
