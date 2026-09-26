// "Do not change anything" is a prohibition, not a preference.
//
// Measured 2026-09-22 (run 5316f52b): "Playtest the game for 5 seconds and tell me what the output log
// shows. Do not change anything in the place." — and Agent mode created a RemoteEvent anyway, reporting
// it as "the only change made". A run told not to change the place is offered no tool that can.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = (src) => {
  const out = join(tmpdir(), `apple-${src.replace(/\W/g, '-')}-${process.pid}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', src), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`], { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const rOut = bundle('reasoning.ts');
const R = await import(`file://${rOut}`);
rmSync(rOut, { force: true });
const tOut = bundle('tools.ts');
const T = await import(`file://${tOut}`);
rmSync(tOut, { force: true });
const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');

test('the request that was violated is recognised as forbidding changes', () => {
  assert.equal(R.forbidsChanges('Playtest the game for 5 seconds and tell me what the output log shows. Do not change anything in the place.'), true);
  for (const t of [
    "Look at my game and tell me what's wrong, don't change anything",
    'Review the scripts without changing anything',
    'Just inspect it, do not modify the place',
    'Read-only please: what does the leaderboard script do?',
    "Don't touch my game, only explain the lag",
    'In the connected isolated garden place, establish a gameplay baseline. Run play_check, play_check_ui, and audit_build at most once each. Do not edit scripts, insert assets, upload anything, or change the saved place. Report the core loop steps actually observed.',
    'Inspect the scripts, but do not change the saved place.',
  ]) assert.equal(R.forbidsChanges(t), true, t);
});

test('a request FOR a change with a limit on it is never read as read-only', () => {
  for (const t of [
    'Fix the door without changing anything else',
    "Add a shop but don't change anything else",
    "Make the lamp brighter, don't change the colours",
    "Build a tower but don't touch my game's scripts",
    'Change the baseplate to grass',
    'Make a coin collecting game',
    'Do not edit scripts, but change the saved place by adding a tree',
  ]) assert.equal(R.forbidsChanges(t), false, t);
});

test('a read-only run is offered no project-writing tool and owes no mutation', () => {
  const writers = T.projectMutatingToolNames();
  assert.ok(writers.length > 10 && writers.includes('create_instances') && writers.includes('edit_script'),
    `the writer list looks wrong (${writers.length}) — this test would check nothing`);
  assert.match(SESSION, /const READ_ONLY_WITHHELD = new Set\(projectMutatingToolNames\(\)\);/);
  // The narrowing happens to `base`, which every later narrowing (permissions, autonomous, plugin
  // capabilities) starts from, so nothing downstream can hand a writer back. The read-only branch
  // is tested first, so the one-step unstick narrowing after it can never apply to such a run.
  assert.match(SESSION, /const base = agent\.readOnly\s*\?\s*new Set\(\[\.\.\.modeBase\]\.filter\(\(name\) => !READ_ONLY_WITHHELD\.has\(name\)\)\)\s*:/);
  assert.match(SESSION, /const userAllowed = agent\.mode === 'agent' && agent\.autonomous\s*\?\s*base/);
  // The "you have not changed the project yet" nudge must not fire on a run that was told not to.
  assert.match(SESSION, /const askedForWork =[^;]*!agent\.readOnly;/);
  // Pinned when the run starts, from the user's own words, in Agent mode only.
  assert.match(SESSION, /\.\.\.\(mode === 'agent' && forbidsChanges\(text\) \? \{ readOnly: true \} : \{\}\)/);
});

// Measured 2026-09-22 (run 3bcf3f57): "Look at my game and tell me why. Don't change anything yet." ended
// incomplete with "I looked around but never made the edit you asked for" — no edit had been asked for.
test('an unfinished read-only run does not apologise for an edit nobody asked for', () => {
  const at = SESSION.indexOf("reason === 'incomplete'\n        ? artifact.missing");
  assert.ok(at > 0, 'the incomplete-reply block was not found — this test would check nothing');
  const block = SESSION.slice(at, SESSION.indexOf("agent.finalText || (reason === 'stopped'", at));
  const ro = block.indexOf('agent.readOnly');
  const edit = block.indexOf("'I did not change anything in your project. I looked around but never made the edit you '");
  assert.ok(ro > 0 && edit > ro, 'the read-only reply must be chosen before the "never made the edit" one');
  assert.match(block.slice(ro, edit), /Nothing was changed, as you asked/);
});

test('excluding named instance paths does not forbid the explicitly requested move', () => {
  assert.equal(R.forbidsChanges('Move game.Workspace.Bench to game.ServerStorage. Do not touch game.Workspace.Garden.Bench or GardenMeshTrees.'), false);
  assert.equal(R.forbidsChanges('Move a bench. Do not touch game["Workspace"].Garden.'), false);
  assert.equal(R.forbidsChanges('Do not touch my game. Explain only.'), true);
  assert.equal(R.forbidsChanges('Do not touch the saved place, only explain.'), true);
});
