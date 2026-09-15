/**
 * THE RESTORE THE USER CAN SEE.
 *
 * Pressing Restore used to close the drawer and go quiet: the worker broadcast nothing while the
 * op ran and nothing at all when it succeeded, so the one operation that DELETES a person's place
 * before rebuilding it gave them no signal for up to two minutes, and no report afterwards about
 * what actually came back.
 *
 * The wording is a module rather than a JSX ternary precisely so these can be asserted.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const { restoreSentence, restoreTone, restoreInFlight, fidelityLine } = await import('../src/lib/restore-status.ts');

const CLEAN = { instancesCreated: 9, scriptsRestored: 2, scriptsExpected: 2, failedInstances: 0, failedScripts: 0, failedProperties: 0 };
const at = (phase, rest = {}) => ({ type: 'restore_status', checkpointId: 'cp1', phase, ...rest });

test('a restore in flight reads as in flight, not as finished', () => {
  for (const phase of ['reading', 'applying', 'verifying']) {
    assert.equal(restoreTone(at(phase)), 'working', phase);
    assert.ok(restoreInFlight(at(phase)), `${phase} must hold the drawer open`);
    assert.match(restoreSentence(at(phase)), /…$/, `${phase} must read as ongoing`);
  }
});

test('a clean restore is the only thing that reads as plain success', () => {
  assert.equal(restoreTone(at('done', { fidelity: CLEAN })), 'good');
  assert.equal(restoreInFlight(at('done', { fidelity: CLEAN })), false);
});

test('a restore nobody could verify does not render as success', () => {
  // The plugin sent no `restored` verdict. The worker says so in `note`; a green tick over that
  // would be a failure to observe rendered as an observation.
  const s = at('done', { fidelity: CLEAN, note: 'This Studio plugin is too old to report what it restored, so the result could not be verified.' });
  assert.equal(restoreTone(s), 'caveat');
  assert.equal(restoreSentence(s), s.note, 'the caveat is shown verbatim, not summarised away');
});

test('a restore that could not set properties shows the caveat verbatim', () => {
  const s = at('done', { fidelity: { ...CLEAN, failedProperties: 4 }, note: 'Restored, but 4 properties could not be set — some objects may differ from the checkpoint.' });
  assert.equal(restoreTone(s), 'caveat');
  assert.equal(restoreSentence(s), s.note);
  assert.match(fidelityLine(s.fidelity), /4 properties failed/);
});

test('a failure names what went wrong rather than saying only that it failed', () => {
  const s = at('failed', { error: 'three models would not rebuild' });
  assert.equal(restoreTone(s), 'bad');
  assert.match(restoreSentence(s), /three models would not rebuild/);
  assert.equal(restoreInFlight(s), false);
});

test('scripts are always reported against what was expected', () => {
  // "12 scripts" cannot tell a complete restore from one that silently dropped three.
  assert.match(fidelityLine({ ...CLEAN, scriptsRestored: 9, scriptsExpected: 12 }), /9\/12 scripts/);
});

test('no report at all renders as no report, not as zeros', () => {
  assert.equal(fidelityLine(undefined), null);
});

test('nothing is in flight when there has been no restore', () => {
  assert.equal(restoreInFlight(null), false);
});

test('the socket hook handles the restore frame and exposes it', () => {
  const src = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
  assert.match(src, /case 'restore_status'/, 'the frame must be handled, not dropped on the floor');
  assert.match(src, /restoreStatus/, 'and surfaced to the route that has to draw it');
});

test('the checkpoints drawer draws the restore and stops slamming itself shut', () => {
  const src = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
  assert.match(src, /restoreSentence/, 'the drawer must render the status sentence');
  assert.match(src, /fidelityLine/, 'and what actually came back');
  // The defect in one line: `restoreCheckpoint(c.id); setDrawer(null);` — the panel shut on the
  // click and the user never saw the result of the thing they had just started.
  assert.ok(
    !/restoreCheckpoint\(c\.id\);\s*\n\s*setDrawer\(null\);/.test(src),
    'restoring must not close the drawer that is about to show the result',
  );
});
