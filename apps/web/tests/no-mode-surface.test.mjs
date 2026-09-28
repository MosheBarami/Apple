/**
 * NO MODE SURFACE (V3 gate G01; handoff: "Remove user-facing Plan, Agent and Autonomous modes").
 *
 * Every request runs the one Apple behaviour. The web app offers no Plan/Agent switch, no
 * Autonomous toggle, and no mode choice anywhere a person could reach one (composer, workspace,
 * automations, roadmap, usage). The wire keeps `mode: 'agent'` only as a compatibility bridge for a
 * worker deployed separately; nothing in the app chooses it.
 *
 * Replaces composer-plan-or-agent.test.mjs and offered-modes.test.mjs, which held the opposite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as shared from '@golem/shared';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(WEB, 'src', p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\/\/[^\n]*\n/g, '{\n');

test('the shared vocabulary offers no mode list: one per-request entry, and no Plan or Autonomous', () => {
  assert.equal('PRODUCT_MODES' in shared, false, 'a list of modes to choose from is back');
  assert.equal('PRODUCT_MODE_INFO' in shared, false);
  assert.deepEqual(Object.keys(shared.MODE_INFO), ['agent']);
});

test('the composer draws no mode switch and no Autonomous toggle, and takes no mode props', () => {
  const composer = code('components/ws/composer.tsx');
  assert.doesNotMatch(composer, /ModeSwitch|onModeChange|onAutonomousChange|gx-autonomous|is-autonomous|ProductMode/);
  assert.doesNotMatch(composer, /\bautonomous\b/i);
  for (const gone of ['components/picks/composer/mode-switch.tsx', 'components/picks/composer/mode-switch.css', 'components/picks/chat/plan-card.tsx']) {
    assert.equal(existsSync(join(WEB, 'src', gone)), false, `${gone} is back`);
  }
});

test('the workspace holds no mode or Autonomous state and ignores a legacy mode in a handoff', () => {
  const ws = code('routes/workspace.tsx');
  assert.doesNotMatch(ws, /setMode|setAutonomous|PRODUCT_MODES|onBuildPlan|\bautonomous\b/);
  assert.match(ws, /sendChat\(text, attachments, productModel\)/);
  assert.match(ws, /location\.state as \{ seed\?: unknown \} \| null/, 'the roadmap handoff reads only the seed');
});

test('chat and edit frames carry the bridge value agent and never an Autonomous grant', () => {
  const socket = code('lib/use-project-socket.ts');
  const edit = socket.slice(socket.indexOf('const editAndResend ='), socket.indexOf('const sendChat ='));
  const chat = socket.slice(socket.indexOf('const sendChat ='), socket.indexOf('const sendChat =') + 1500);
  for (const [name, fn] of [['chat', chat], ['edit_resend', edit]]) {
    assert.match(fn, /const mode = 'agent';/, `${name}: the frame's mode is the bridge literal`);
    assert.doesNotMatch(fn, /autonomous/i, `${name}: an Autonomous grant rides on the frame`);
    assert.doesNotMatch(fn, /mode: ProductMode/, `${name}: the caller chooses a mode`);
  }
  assert.doesNotMatch(socket, /autonomous/i);
});

test('no surface a person can reach offers a mode choice', () => {
  const surfaces = {
    'components/ws/automations-panel.tsx': /MODE_CHOICES|field-label">Mode</,
    'lib/automations.ts': /MODE_CHOICES|PRODUCT_MODES|bad_mode/,
    'components/roadmap/milestone-card.tsx': /onBrief\([^)]*'plan'\)|'Plan changes'|>\s*Plan\s*</,
    'components/roadmap/suggestions.tsx': /onBrief\([^)]*'plan'\)/,
    'components/roadmap/dependency-map.tsx': /onBrief\([^)]*'plan'\)|Plan changes/,
    'components/roadmap/brief-dialog.tsx': /PRODUCT_MODE_INFO|modeForIntent|\bmode\b/,
    'routes/usage.tsx': /Plan or Agent|Autonomous|PRODUCT_MODE(?!L)|RUN_MODE_COMPARISON/,
    'routes/studio-preview.tsx': /onModeChange|autonomous/,
  };
  for (const [file, forbidden] of Object.entries(surfaces)) {
    assert.doesNotMatch(code(file), forbidden, `${file} still offers a mode`);
  }
});
