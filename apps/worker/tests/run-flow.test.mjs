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

test('run flow: the step after a ready verdict offers no tools, so the reply is the answer', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8');
  assert.match(src, /const talkOnly = \([^\n]*\) \|\| agent\.judgedReady === true;/);
  assert.match(src, /tools: talkOnly \? \[\] :/);
  assert.match(src, /if \(out\.ok && saysReady\(call\.name, out\.resultForLlm\)\) agent\.judgedReady = true;/);
  assert.match(src, /!owesWork && !agent\.judgedReady \? steerToPart\(agent\)/, 'no part steer after ready');
  assert.match(src, /agent\.mutated && canBuild && !owesWork && !agent\.judgedReady &&/, 'no keep-going steer after ready');
});

test('run flow: a built place is never a reason to refuse a build: the project\'s ledger is information, and a rebuild is the agent\'s call', async () => {
  const { readFileSync } = await import('node:fs');
  const flow = readFileSync(new URL('../src/run-flow.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // RESTATED phase 1: a second request on a built place used to be told "This project already holds its game ... Never plan, build
  // or import a new game", and plan_game / build_game / compose_game / recreate_owner_game were refused (continueGameLine,
  // refuseRebuild, wantsNewGame, a regex deciding whether the user asked for "a new game"). Now what earlier runs built is
  // listed as labelled information (build-ledger.ts), and nothing is refused (tests/build-ledger.test.mjs).
  for (const gone of ['continueGameLine', 'refuseRebuild', 'wantsNewGame', 'REBUILD_TOOLS', 'BuiltGameRecord']) assert.equal(flow.includes(gone), false, `${gone} is back in run-flow.ts`);
  const src = readFileSync(new URL('../src/do/session.ts', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /refuseRebuild|continuesGame|storage\.put\('builtGame'/);
  assert.match(src, /await this\.recordBuild\(agent, call\.name, call\.arguments, out\)/, 'a build is written to the ledger instead');
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
