import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
function bundle(source, tag) {
  const out = join(mkdtempSync(join(tmpdir(), `roadmap-ui-${tag}-`)), `${tag}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', source), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out,
  ], { cwd: WORKER, stdio: 'pipe' });
  return out;
}

const R = await import(`file://${bundle('roadmap.ts', 'roadmap')}`);
const P = await import(`file://${bundle('prefabs.ts', 'prefabs')}`);
const APPLE_UI_PATH = 'game.ReplicatedStorage.AppleUI';

function scan(scripts, truncated = {}) {
  return {
    counts: { instances: scripts.length, parts: 0, scripts: scripts.length },
    services: {}, classes: {}, named: [], lighting: [], guis: [], topLevel: [], place: '', scripts,
    truncated: { scan: false, named: false, scripts: false, source: false, ...truncated },
  };
}

function script(path, source, className = 'ModuleScript') {
  return { path, className, lines: source.split('\n').length, source };
}

test('the installed AppleUI source is not quest evidence, including a per-script cap', () => {
  const source = P.PREFABS.ui_kit.source;
  const full = R.analyzeProject(scan([script(APPLE_UI_PATH, source)]));
  assert.equal(full.features.quests.state, 'absent', 'UI labels must not become a gameplay feature');

  // The live scan caps each script. Its known prefix is not evidence of gameplay, but the unread
  // tail could have been modified: partial source must not establish confident absence.
  const capped = source.slice(0, 6000);
  const partial = R.analyzeProject(scan([script(APPLE_UI_PATH, capped)], { source: true }));
  assert.equal(partial.features.quests.state, 'unknown', 'a capped prefix cannot prove its unread tail');
});

test('quest evidence in a separate gameplay script survives the UI exclusion and source cap', () => {
  const source = P.PREFABS.ui_kit.source;
  const gameplay = 'local objective = { id = "escape", target = 3 }\nreturn objective';
  const shape = R.analyzeProject(scan([
    script(APPLE_UI_PATH, source.slice(0, 6000)),
    script('game.ServerScriptService.QuestController', gameplay, 'Script'),
  ], { source: true }));
  assert.equal(shape.features.quests.state, 'present');
  assert.match(shape.features.quests.evidence, /objective/);
});

test('a similarly named user module is not exempted from quest detection', () => {
  const source = '--!nonstrict\nlocal objective = {}\nreturn objective';
  const shape = R.analyzeProject(scan([script('game.ReplicatedStorage.MyAppleUI', source)]));
  assert.equal(shape.features.quests.state, 'present');
});

test('retaining the AppleUI header and path cannot conceal modified gameplay source', () => {
  const modified = P.PREFABS.ui_kit.source.replace('local AppleUI = {}', 'local AppleUI = {}\nlocal objective = { target = 3 }');
  const shape = R.analyzeProject(scan([script(APPLE_UI_PATH, modified)]));
  assert.equal(shape.features.quests.state, 'present');
  const shortHeader = '--!nonstrict\n-- AppleUI: retained header\nlocal objective = {}';
  assert.equal(R.analyzeProject(scan([script(APPLE_UI_PATH, shortHeader)], {source:true})).features.quests.state, 'present');
});

test('known UI source at another install path is still presentation, not gameplay', () => {
  assert.equal(R.analyzeProject(scan([script('game.ReplicatedStorage.Shared.Interface', P.PREFABS.ui_kit.source)])).features.quests.state, 'absent');
});
