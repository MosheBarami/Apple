/**
 * A PAGE THAT MISSED THE END OF A RUN LEARNS IT ON RECONNECT.
 *
 * 2026-09-23: the owner's Grow-a-Garden build ended on the server (100 steps, read-stall close) while
 * his page, having stopped hearing the run at step ~60, still showed "Working out the next step". A
 * reconnect could not fix it: the worker sent `run_state` only while a run was live, so a page that
 * missed `msg_end` never heard that the run was over.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const strip = (s) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
const HOOK = strip(readFileSync(new URL('../src/lib/use-project-socket.ts', import.meta.url), 'utf8'));
const SESSION = strip(readFileSync(new URL('../../worker/src/do/session.ts', import.meta.url), 'utf8'));

test('the worker tells every new socket whether a run is in flight, including when none is', () => {
  const i = SESSION.indexOf('const live = await this.runSnapshot();');
  assert.ok(i >= 0, 'the connect-time snapshot is gone');
  const next = SESSION.slice(i, SESSION.indexOf(';', SESSION.indexOf('run_state', i)) + 1);
  assert.match(next, /server\.send\(JSON\.stringify\(\{ type: 'run_state', run: live/);
  assert.doesNotMatch(next, /if \(live\)/, 'run_state must not wait for a live run');
});

test('a no-run run_state settles a turn still streaming and reloads the stored reply', () => {
  const start = HOOK.indexOf("case 'run_state': {");
  assert.ok(start >= 0, 'run_state handler not found');
  const noRun = HOOK.slice(start, HOOK.indexOf('break;', HOOK.indexOf('if (!msg.run)', start)));
  assert.match(noRun, /setRunning\(false\)/);
  assert.match(noRun, /streaming: false/);
  assert.match(noRun, /loadHistory\(\)/);
});
