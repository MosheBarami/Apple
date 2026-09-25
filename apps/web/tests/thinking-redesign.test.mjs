/** Contract checks for the thinking surface: one friendly status line (owner decision D-THINK-1). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const JSX = readFileSync(join(WEB, 'src/components/ws/thinking.tsx'), 'utf8');
const TURN = readFileSync(join(WEB, 'src/components/ws/turn.tsx'), 'utf8');

/**
 * Negative source assertions must ignore comments. Removed implementations are often described in
 * comments, and treating that prose as live code makes the guard preserve the thing it is deleting.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const CODE = stripComments(JSX);

/** The names one import statement brings in from `spec`, read from the statement itself. */
function importedNames(source, spec) {
  const m = new RegExp(`import \\{([^}]*)\\} from '${spec.replace(/[./]/g, '\\$&')}'`).exec(source);
  return m ? m[1].split(',').map((part) => part.trim().replace(/^type\s+/, '')).filter(Boolean) : [];
}

//[[ RESTATED 2026-09-24 (owner decision D-THINK-1). The three tests that stood here pinned the
//   Reasoning disclosure (its trigger, its duration, its open state), the AI Elements header and the
//   execution-model.ts row selection. The owner replaced the card with one friendly status line and
//   asked that there be no way at all to open technical detail. The properties now: nothing to open,
//   one Shimmer only while live, and the words come from lib/live-status.ts — the renderer never
//   reads a step's own summary, payload, target, tool name or timing. Rendered checks are in
//   tests/thinking-surface.test.mjs and tests/live-status.test.mjs. ]]
test('there is nothing to open: no disclosure, trace, tool row or button in the thinking surface', () => {
  for (const spec of ['../ai-elements/reasoning', '../ai-elements/chain-of-thought', '../ai-elements/tool', '../ui/collapsible']) {
    assert.deepEqual(importedNames(CODE, spec), [], `thinking.tsx takes a disclosure part from ${spec}`);
  }
  assert.doesNotMatch(CODE, /<(?:Reasoning|ChainOfThought|Tool|Collapsible)\w*\b/, 'a disclosure or trace component is drawn');
  assert.doesNotMatch(CODE, /aria-expanded|aria-controls|<details\b|<button\b|onClick=/, 'something in the surface can be opened');
});

test('the live line is one Shimmer, drawn only while the run is live; no AICSS', () => {
  assert.doesNotMatch(CODE, /aicss/, 'an AICSS component is back in the thinking surface');
  assert.doesNotMatch(CODE, /\b(?:Orb|ThinkingState|StreamingText|reasoningOrb)\b/, 'a retired AICSS piece is back');
  assert.deepEqual(importedNames(CODE, '../ai-elements/shimmer'), ['Shimmer']);
  assert.equal((CODE.match(/<Shimmer\b/g) ?? []).length, 1, 'one moving line, not one per step');
  assert.match(CODE, /const isLive = streaming && !activity\.terminal;/, 'live means streaming and not yet ended');
  assert.match(CODE, /if \(isLive\) \{[\s\S]*?<MorphingWords\b/, 'the moving words belong only to the live state');
  assert.doesNotMatch(CODE, /Thought for/, 'a duration is technical detail and is not drawn');
});

test('the words come from lib/live-status.ts; the renderer never reads a step\'s own facts', () => {
  assert.deepEqual(importedNames(CODE, '../../lib/live-status').sort(), ['doneSummary', 'livePhrase']);
  assert.doesNotMatch(CODE, /\.(?:summary|detail|target|durationMs|startedAt|tool|toolId|error)\b/,
    'thinking.tsx reads a raw step fact, which could reach the customer');
  assert.doesNotMatch(CODE, /\.state === '(?:failed|unknown|active|done)'/,
    'thinking.tsx must not decide from a step\'s state; live-status.ts does');
});

test('the retired custom Stage/Activity card chrome cannot reappear', () => {
  for (const forbidden of [
    /function Stage\b/,
    /<Stage\b/,
    /<Activity\b/,
    /from ['"]\.\/activity['"]/,
    /\bbuildTimeline\b/,
    /\bModelMark\b/,
    /\binterfaceSound\b/,
    /\breadSoundEnabled\b/,
    /\bwriteSoundEnabled\b/,
    /gx-think__sound/,
    /View details/i,
    /Hide details/i,
    /gx-stage-row/,
    /gx-think__body/,
    /\bStatusIcon\b/,
  ]) {
    assert.doesNotMatch(CODE, forbidden, `retired thinking implementation returned: ${forbidden}`);
  }

  assert.doesNotMatch(CODE, /[✓✔✗✘✕❌☒☑]/,
    'reasoning progress must not use static tick/cross glyphs');
  assert.doesNotMatch(TURN, /View results/i,
    'structured results must remain inline rather than returning behind the retired results disclosure');
});

test('a playtest is said in words, not drawn as a card in the thinking surface', () => {
  //[[ RESTATED 2026-09-24 (D-THINK-1): the PlaytestCard (frames, run log) was detail inside the
  //   Thinking disclosure. The playtest is now the live line's "Playing your game". ]]
  assert.doesNotMatch(CODE, /<PlaytestCard\b|ProjectStage|gx-stage\b/, 'a playtest card or stage is back in the thinking surface');
});

test('honesty: observed facts only, no denied-tools note, failures stay with the turn outcome', () => {
  //[[ RESTATED 2026-09-24 (D-THINK-1): the gate list, planned-steps line and "Observed run activity"
  //   region were detail and are gone. What stays: no placeholder for an unobserved run,
  //   one polite announcement of the live line, and failure copy owned by the outcome row. ]]
  assert.doesNotMatch(CODE, /apple-status__note|turned off in your settings/, 'no persistent notice belongs in thinking');
  assert.equal((CODE.match(/role="status"/g) ?? []).length, 1, 'the live line needs exactly one non-visual announcement');

  assert.doesNotMatch(CODE, /<ActivityTerminal\b|<Failure\b|is-fail|is-bad/,
    'Thinking must stay calm and must not own terminal failure presentation');
  // RESTATED 2026-09-23 (F-045): the reply is now a third argument; the property is the source of copy.
  assert.match(TURN, /const outcome = outcomeLine\(item\.stopReason, item\.error\b/,
    'the turn outcome model must remain the source of terminal failure copy');
  assert.match(TURN, /className=\{`gx-outcome\$\{outcome\.tone === 'bad' \? ' is-bad' : ''\}`\}/,
    'terminal failures must remain in the answer-level outcome row');
});
