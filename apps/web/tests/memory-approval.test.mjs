// The queue of things Apple has ASKED to remember, and the two buttons that answer it.
//
// Under the `review` memory setting the distiller stops writing facts and starts proposing them.
// The worker has had the whole mechanism for a while — a queue, an accept that records the fact as
// the MODEL's rather than the approver's, a discard that leaves active memory untouched, and a
// deliberate 404 when the proposal is already gone. All of it was unreachable: api.ts described
// memory as `{summary, facts}` with no `suggested` field at all, so the panel could not SEE a
// pending proposal, while tools.ts was telling the model each fact was "queued for the user to
// approve in the memory panel" — a panel with no such queue.
//
// Three failures are covered here:
//
//   1. A QUEUE THE CLIENT CANNOT SEE. The parse has to keep `suggested`, and has to survive a
//      response that omits it rather than throwing on the screen that would fix the problem.
//   2. AN ANSWER REPORTED THAT NOBODY GAVE. Two tabs, one proposal: the second click gets the
//      worker's 404, and a panel that renders that as "could not discard" is describing the wrong
//      event. It has to read as "already answered" and refetch.
//   3. A DECISION THAT NAMES NOTHING. The decision carries the fact's TEXT, because that is what
//      the worker matches on; a request without it is a decision about whatever happens to be
//      first in the queue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'memapp-')), 'a.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'memory-approvals.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { cwd: WEB, stdio: 'pipe' });
const M = await import(`file://${out}`);

const PANEL = readFileSync(join(WEB, 'src', 'components', 'ws', 'memory-panel.tsx'), 'utf8');
const API = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');

/* --------------------------------------------------------------- 1. seeing it --- */

test('the client type carries the queue at all', () => {
  // The root cause, asserted where it lives: `Memory` used to be `{summary, facts}`, and no amount
  // of panel code can render a field the response type drops.
  assert.match(API, /suggested\??:\s*\{/, 'api.ts still describes memory with no suggestion queue');
  assert.match(API, /decideSuggestion/, 'nothing in the client posts a decision');
  assert.match(API, /memory\/suggestions/, 'the decision route is not called from anywhere');
});

test('a response with no queue is "nothing pending", not a crash', () => {
  // Everything off the network is parsed state. This runs on every open of the panel, and the
  // panel is the screen someone needs in order to fix a memory that is wrong about their project.
  for (const junk of [null, undefined, {}, { suggested: null }, { suggested: 'yes' }, { suggested: { facts: 'no' } }]) {
    const p = M.pendingFrom(junk);
    assert.deepEqual(p.facts, [], JSON.stringify(junk));
    assert.equal(p.summary, null, JSON.stringify(junk));
    assert.equal(M.hasPending(junk), false);
  }
});

test('a real queue comes through whole, and non-strings in it do not', () => {
  const p = M.pendingFrom({ suggested: { summary: 'A tycoon.', facts: ['doors use DoorService', 42, '', '  spaced  '] } });
  assert.equal(p.summary, 'A tycoon.');
  assert.deepEqual(p.facts, ['doors use DoorService', 'spaced']);
  assert.equal(M.hasPending({ suggested: { summary: null, facts: ['one'] } }), true);
  assert.equal(M.hasPending({ suggested: { summary: 'x', facts: [] } }), true, 'a summary alone is still waiting');
});

/* ------------------------------------------------------- 2. the second answer --- */

test('a 404 is SOMEONE ALREADY ANSWERED, not a failure', () => {
  // The worker returns 404 on purpose (session.ts:1030) so a stale panel cannot report a decision
  // the user never made. Rendering it as an error describes the wrong event and leaves the panel
  // showing a proposal that is gone.
  assert.equal(M.isAlreadyAnswered({ name: 'ApiError', status: 404 }), true);
  assert.equal(M.isAlreadyAnswered({ name: 'ApiError', status: 403 }), false);
  assert.equal(M.isAlreadyAnswered({ name: 'ApiError', status: 500 }), false);
  assert.equal(M.isAlreadyAnswered(new Error('offline')), false, 'a network failure is not an answer');
  assert.equal(M.isAlreadyAnswered(null), false);
});

test('the panel treats it as one — refetch, not an error toast', () => {
  assert.match(PANEL, /isAlreadyAnswered/, 'the panel does not distinguish the deliberate 404');
});

/* ---------------------------------------------------------- 3. what it decides --- */

test('a decision names the fact it is about', () => {
  assert.deepEqual(M.decisionBody('accept', 'doors use DoorService'), { decision: 'accept', fact: 'doors use DoorService' });
  assert.deepEqual(M.decisionBody('discard', 'doors use DoorService'), { decision: 'discard', fact: 'doors use DoorService' });
  // The summary is the one proposal with no text to match on, so it is addressed by target.
  assert.deepEqual(M.decisionBody('accept', null), { decision: 'accept', target: 'summary' });
});

test('BOTH answers are offered — a queue with only Keep is not a review', () => {
  // Discard is the half that gets dropped: it is the one that looks like doing nothing. It is not
  // — it removes the proposal and leaves active memory untouched, and without it the only way to
  // clear the queue is to accept everything in it.
  assert.match(PANEL, /decideSuggestion/, 'the panel never posts a decision');
  assert.match(PANEL, /'accept'/, 'no accept path in the panel');
  assert.match(PANEL, /'discard'/, 'no discard path in the panel');
});

test('the queue renders ABOVE the facts, and says what answering it does', () => {
  const queueAt = PANEL.indexOf('pendingFrom');
  const factsAt = PANEL.indexOf('Facts it keeps');
  assert.ok(queueAt > -1, 'the panel does not read the queue');
  assert.ok(queueAt < factsAt, 'the pending queue is rendered below the facts it is waiting to join');
});
