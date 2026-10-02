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
  assert.match(src, /\(call\.name === 'build_game' \|\| call\.name === 'compose_game'\)\) \{\s*agent\.builtGame = true;[^}]*storage\.put\('builtGame'/);
  assert.match(src, /continueGameLine\(await this\.ctx\.storage\.get<BuiltGameRecord>\('builtGame'\), text\)/);
  assert.match(src, /\?\? refuseRebuild\(agent\.continuesGame, call\.name\)/);
});

test('run flow: compose_game is offered like every other tool and never forced, by a template guess or by anything else', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // RESTATED phase 1 (2026-10-02): the request's words used to pick compose_game, build_object or add_upgrades before the
  // model spoke (a regex decided "this is a game"). Now the run starts with the model, which chooses; only a sequence the
  // USER spelled out ("first X, then Y") can require a tool.
  assert.equal(/composeFirst|objectFirst|upgradesFirst|coolFirst/.test(src), false, 'a forced-first flag is back');
  assert.equal(/\bideaRecipe\b|isObjectRequest|isUpgradesRequest|isUpgradeRequest/.test(src), false, 'a request classifier routes the run');
  const required = src.split('\n').filter((l) => /\brequiredTool\b/.test(l) && !/sequenceStep/.test(l));
  assert.deepEqual(required, [], 'a tool is required by something other than the user\'s own sequence');
  assert.match(src, /toolDefs\(offerStudio, offeredAllowed\)/, 'the tools offered are the permitted set');
  assert.match(src, /\? \{ requiredTool: sequenceStep\.tool \}/, 'the user\'s own sequence still requires its tool');
});
