import test from 'node:test';
import assert from 'node:assert/strict';
import { afterReady, continueGameLine, refuseRebuild, saysReady, wantsNewGame } from '../src/run-flow.ts';

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

test('run flow: the step after a ready verdict offers no tools, so the reply is the answer', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8');
  assert.match(src, /const talkOnly = \([^\n]*\) \|\| agent\.judgedReady === true;/);
  assert.match(src, /tools: talkOnly \? \[\] :/);
  assert.match(src, /if \(out\.ok && saysReady\(call\.name, out\.resultForLlm\)\) agent\.judgedReady = true;/);
  assert.match(src, /!owesWork && !agent\.judgedReady \? steerToPart\(agent\)/, 'no part steer after ready');
  assert.match(src, /agent\.mutated && canBuild && !owesWork && !agent\.judgedReady &&/, 'no keep-going steer after ready');
});

test('run flow: a second request on a built place continues that game instead of building a new one', () => {
  const built = { at: 1, request: 'Plants vs Brainrots, but the brainrots are fruit' };
  const line = continueGameLine(built, 'Plants vs Brainrots, but the brainrots are fruit');
  assert.match(line, /already holds its game, built earlier from: "Plants vs Brainrots/);
  assert.match(line, /Never plan, build or import a new game or a new map/);
  assert.equal(continueGameLine(undefined, 'make the shop bigger'), undefined, 'a project with no built game builds one');
  assert.equal(continueGameLine(built, 'start over with a new game about pirates'), undefined, 'asking for a new game in words lifts it');
  for (const t of ['start over', 'build it again from scratch', 'make a different game', 'rebuild', 'replace this game with an obby']) assert.equal(wantsNewGame(t), true, t);
  for (const t of ['make the shop bigger', 'the enemies should walk', 'is it done?', 'add a new gamepass']) assert.equal(wantsNewGame(t), false, t);
  for (const tool of ['plan_game', 'build_game', 'recreate_owner_game']) assert.match(refuseRebuild(true, tool), /already holds its game/);
  assert.equal(refuseRebuild(true, 'edit_script'), undefined, 'changing the game in place goes on');
  assert.equal(refuseRebuild(false, 'build_game'), undefined);
});

test('run flow: build_game records the project\'s game and the next run reads it', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8');
  assert.match(src, /call\.name === 'build_game'\) \{\s*agent\.builtGame = true;[^}]*storage\.put\('builtGame'/);
  assert.match(src, /continueGameLine\(await this\.ctx\.storage\.get<BuiltGameRecord>\('builtGame'\), text\)/);
  assert.match(src, /\?\? refuseRebuild\(agent\.continuesGame, call\.name\)/);
});
