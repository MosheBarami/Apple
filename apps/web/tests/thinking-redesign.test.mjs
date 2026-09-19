/** Contract checks for the always-useful, event-backed Thinking card surface. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const JSX = readFileSync(join(WEB, 'src/components/ws/thinking.tsx'), 'utf8');
const TURN = readFileSync(join(WEB, 'src/components/ws/turn.tsx'), 'utf8');
const CSS = readFileSync(join(WEB, 'src/design/system.css'), 'utf8');

test('the activity card has one status-backed header and starts closed', () => {
  assert.equal((JSX.match(/className="gx-think__head"/g) ?? []).length, 1,
    'the card must not grow a second compact activity row');
  assert.match(JSX, /const title = activity\.terminal\?\.note \?\?/);
  assert.match(JSX, /compact\.current/);
  assert.match(JSX, /status \?/);
  assert.match(JSX, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(JSX, /aria-expanded=\{open\}/);
  assert.match(JSX, /aria-hidden=\{!open\}/);
  assert.doesNotMatch(JSX, /Current action/);
  assert.doesNotMatch(JSX, /className="gx-think__compact/);
});

test('terminal truth replaces the Thinking heading and still has an expandable detail region', () => {
  assert.match(JSX, /const title = activity\.terminal\?\.note \?\?/);
  assert.match(JSX, /PHASE_LABEL\[status\.phase\]/);
  assert.match(JSX, /aria-controls=\{detailsId\}/);
  assert.match(JSX, /aria-hidden=\{!open\}/);
  assert.match(JSX, /<ActivityTerminal terminal=\{activity\.terminal\}/);
});

test('identity motion is live-only and stops for terminal, reduced, or hidden cards', () => {
  assert.match(JSX, /const isLive = streaming && !activity\.terminal/);
  assert.match(JSX, /<ModelMark live=\{isLive && !reducedMotion && !pageHidden\}/);
  assert.match(CSS, /\.gx-think__compact-ring\b/);
  assert.match(CSS, /\.gx-think\.is-terminal[^{}]*\.gx-think__compact-ring/);
  assert.match(CSS, /\.gx-think\.is-reduced[^{}]*\.gx-think__compact-ring/);
  assert.match(CSS, /\.gx-think\.is-page-hidden[^{}]*\.gx-think__compact-ring/);
  assert.doesNotMatch(CSS, /scan-frame|banner-art|gx-think-scan/);
});

test('sound control is an accessible stored preference and unlock is gesture-bound', () => {
  assert.match(JSX, /aria-pressed=\{soundEnabled\}/);
  assert.match(JSX, /writeSoundEnabled\(next\)/);
  assert.match(JSX, /interfaceSound\.unlock\(\)/);
  assert.match(JSX, /onClick=\{toggleSound\}/);
  assert.match(CSS, /\.gx-think__sound\b/);
});

test('structured results stay collapsed and scene galleries never enter chat automatically', () => {
  const start = TURN.indexOf('function ResultDetails');
  const end = TURN.indexOf('function Stamp', start);
  assert.ok(start >= 0 && end > start, 'ResultDetails source is missing');
  const resultDetails = TURN.slice(start, end);
  assert.match(resultDetails, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(resultDetails, /block\.type !== 'render_review'/);
  assert.match(resultDetails, /block\.type !== 'scene_comparison'/);
  assert.match(resultDetails, /\{open && compactDocs\.map\(/,
    'structured output must render only after the user opens View results');
  assert.match(TURN, /<summary>View results<\/summary>/);
});
