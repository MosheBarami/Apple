import test from 'node:test';
import assert from 'node:assert/strict';
import { afterReady, saysReady } from '../src/run-flow.ts';

test('run flow: a ready verdict from judge_game ends the changes; the answer is next', () => {
  assert.equal(saysReady('judge_game', '{"verdict":"ready","score":94}'), true);
  assert.equal(saysReady('judge_game', '{"verdict":"not ready","score":61}'), false);
  assert.equal(saysReady('play_check', '{"verdict":"ready"}'), false, 'only the client check decides');
  const writers = new Set(['insert_ui_component', 'rename_instance', 'insert_sound', 'edit_script']);
  assert.match(afterReady(true, 'insert_ui_component', writers), /^The game passed the client check in this run/);
  assert.equal(afterReady(true, 'get_output_logs', writers), undefined, 'reading is fine');
  assert.equal(afterReady(false, 'insert_ui_component', writers), undefined, 'before a ready verdict, fixing goes on');
  assert.equal(afterReady(undefined, 'edit_script', writers), undefined);
});
