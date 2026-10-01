/**
 * Contract checks for the thinking surface.
 *
 * RESTATED 2026-10-01 (owner): "replace the vercel ones with these, not both". The status pill
 * (thinking.tsx) is removed; the thinking surface is run-steps.tsx — genuine AI Elements Reasoning and
 * Task, with Shimmer on what is live. The properties that outlive the pill are held against it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const JSX = readFileSync(join(WEB, 'src/components/ws/run-steps.tsx'), 'utf8');
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

//[[ RESTATED 2026-10-01. These held the pill: nothing to open, ONE Shimmer, words from live-status.
//   The owner then asked for AI Elements Reasoning and Task, which open by design, and for shimmer on
//   every live state. What holds now: the parts are the genuine AI Elements, and the moving words are
//   their Shimmer — no AICSS, no retired orb, no home-made status line. ]]
test('the thinking surface is genuine AI Elements, and its live words are AI Elements Shimmer', () => {
  assert.deepEqual(importedNames(CODE, '../ai-elements/reasoning').sort(), ['Reasoning', 'ReasoningContent', 'ReasoningTrigger']);
  assert.ok(importedNames(CODE, '../ai-elements/task').includes('Task'));
  assert.deepEqual(importedNames(CODE, '../ai-elements/shimmer'), ['Shimmer']);
  assert.doesNotMatch(CODE, /aicss/, 'an AICSS component is back in the thinking surface');
  assert.doesNotMatch(CODE, /\b(?:Orb|ThinkingState|StreamingText|reasoningOrb|MorphingWords)\b|apple-status/, 'a retired piece is back');
  assert.doesNotMatch(TURN, /<Thinking\b|from '\.\/thinking'/, 'the status pill is back beside the AI Elements');
});

test('the words come from lib/live-status.ts', () => {
  assert.deepEqual(importedNames(CODE, '../../lib/live-status').sort(), ['friendlyName', 'toolPhrase']);
  assert.doesNotMatch(CODE, /\.(?:summary|detail|durationMs)\b/, 'run-steps reads a raw step fact, which could reach the customer');
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

  assert.doesNotMatch(CODE, /<ActivityTerminal\b|<Failure\b|is-fail|is-bad/,
    'Thinking must stay calm and must not own terminal failure presentation');
  // RESTATED 2026-09-23 (F-045): the reply is now a third argument; the property is the source of copy.
  assert.match(TURN, /const outcome = outcomeLine\(item\.stopReason, item\.error\b/,
    'the turn outcome model must remain the source of terminal failure copy');
  // RESTATED 2026-10-01: the outcome row is drawn with Tailwind classes in the AI Elements turn; a bad
  // outcome's sentence takes the destructive colour there.
  assert.match(TURN, /data-outcome=\{outcome\.tone\}/, 'terminal failures must remain in the answer-level outcome row');
  assert.match(TURN, /outcome\.tone === 'bad' \? 'text-destructive' : 'text-muted-foreground'/,
    'a bad outcome is said in the destructive colour, in that row');
});
