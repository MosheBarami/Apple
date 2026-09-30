import test from 'node:test';
import assert from 'node:assert/strict';
import { withoutToolTalk } from '../src/plain-reply.ts';

const tools = ['check_ui_layout', 'inspect_visually', 'judge_game', 'build_game', 'get_project_tree'];

test('the reply keeps what the player will see and drops the machinery', () => {
  const reply = 'Got it — every screen will be assembled from stored library components, then checked with check_ui_layout and inspect_visually. ' +
    'Your game is ready and scored 94 out of 100!\n\nPlant fruit defenders in your lanes. The script at game.ServerScriptService.Server handles it.';
  assert.equal(withoutToolTalk(reply, tools), 'Your game is ready and scored 94 out of 100!\n\nPlant fruit defenders in your lanes.');
  assert.equal(withoutToolTalk('Your game is ready.', tools), 'Your game is ready.');
  assert.equal(withoutToolTalk('I ran judge_game.', tools), 'I ran.', 'never an empty reply: only the names go');
  assert.equal(withoutToolTalk('', tools), '');
});
