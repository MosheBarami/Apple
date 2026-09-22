/** Contract checks for the event-backed AI Elements reasoning surface. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const JSX = readFileSync(join(WEB, 'src/components/ws/thinking.tsx'), 'utf8');
const TURN = readFileSync(join(WEB, 'src/components/ws/turn.tsx'), 'utf8');
const REASONING = readFileSync(join(WEB, 'src/components/ai-elements/reasoning.tsx'), 'utf8');
const MODEL = readFileSync(join(WEB, 'src/components/ws/execution-model.ts'), 'utf8');

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

function sliceFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start);
  assert.ok(start >= 0 && end > start, `${name} source is missing`);
  return source.slice(start, end);
}

/** The names one import statement brings in from `spec`, read from the statement itself. */
function importedNames(source, spec) {
  const m = new RegExp(`import \\{([^}]*)\\} from '${spec.replace(/[./]/g, '\\$&')}'`).exec(source);
  return m ? m[1].split(',').map((part) => part.trim().replace(/^type\s+/, '')).filter(Boolean) : [];
}

test('AI Elements Reasoning owns disclosure, streaming state, auto-close, and duration', () => {
  //[[ RESTATED 2026-09-22 (A2). This pinned the exact import line `{ Reasoning, ReasoningTrigger,
  //   useReasoning }`, which any added name breaks. The property is that the card's parts ARE the
  //   vendored Reasoning's, including now the ReasoningContent that owns the disclosure body. ]]
  const names = importedNames(CODE, '../ai-elements/reasoning');
  for (const name of ['Reasoning', 'ReasoningTrigger', 'ReasoningContent', 'useReasoning']) {
    assert.ok(names.includes(name), `thinking.tsx does not take ${name} from the vendored Reasoning (found: ${names})`);
  }
  assert.match(JSX, /<Reasoning\b[\s\S]*?isStreaming=\{isLive\}[\s\S]*?duration=\{elapsedSeconds\}/,
    'Thinking must hand the observed live state and measured duration to the AI Elements root');
  assert.match(JSX, /<ReasoningTrigger\b/);
  //[[ RESTATED. The header used to destructure `{ isOpen, isStreaming, duration }` from
  //   useReasoning() and compose its own line. It now hands ReasoningTrigger a getThinkingMessage,
  //   which Reasoning calls with ITS streaming flag and ITS duration — the same ownership, through
  //   upstream's own extension point. The open state it still reads, for the action name. ]]
  assert.match(CODE, /const \{[^}]*\bisOpen\b[^}]*\} = useReasoning\(\)/,
    'the header must read the disclosure state Reasoning owns');
  assert.match(CODE, /getThinkingMessage=\{\(\s*isStreaming\s*,\s*duration\s*\)\s*=>/,
    'the live line must be drawn from the streaming flag and duration Reasoning hands the trigger');
  assert.match(CODE, /<ReasoningContent\b[^>]*>\s*<ExecutionSurface\b/,
    'the disclosure body must be a ReasoningContent, holding the execution surface'); 
  assert.match(JSX, /aria-label=\{`\$\{title\}\. \$\{isOpen \? 'Hide reasoning details' : 'Show reasoning details'\}`\}/,
    'the disclosure must have an explicit accessible action name');

  assert.match(REASONING, /const resolvedDefaultOpen = defaultOpen \?\? isStreaming/,
    'streaming must own the initial open state');
  assert.match(REASONING, /if \(isStreaming && !isOpen && !isExplicitlyClosed\) \{\s*setIsOpen\(true\)/,
    'streaming must reopen the reasoning surface when appropriate');
  assert.match(REASONING, /hasEverStreamedRef\.current &&\s*!isStreaming &&\s*isOpen &&\s*!hasAutoClosed/,
    'completion must be the condition that starts the one-shot auto-close');
  assert.match(REASONING, /setDuration\(Math\.ceil\(\(Date\.now\(\) - startTimeRef\.current\) \/ MS_IN_S\)\)/,
    'duration must be measured by the shared Reasoning component');

  assert.doesNotMatch(CODE, /\buseState\s*\(/,
    'thinking.tsx must not reintroduce a second disclosure state machine');
  assert.doesNotMatch(CODE, /aria-expanded=\{open\}|aria-hidden=\{!open\}/,
    'the retired local disclosure contract must stay gone');
});

test('the live header is AI Elements\' own trigger: Brain, Shimmer, duration, chevron — no AICSS', () => {
  //[[ RESTATED 2026-09-22 (A2), IN THE OPPOSITE DIRECTION, BY OWNER DECISION. This pinned the
  //   AICSS Orb and ThinkingState in the header. The owner's requirement is the OFFICIAL Vercel AI
  //   Elements look, so the property is now that the header is upstream's ReasoningTrigger with no
  //   children of its own (its Brain and chevron render) and the live line is AI Elements' Shimmer,
  //   drawn only while Reasoning says it is streaming. The rendered header is checked in
  //   tests/thinking-surface.test.mjs. ]]
  assert.doesNotMatch(CODE, /aicss/, 'an AICSS component is back in the thinking surface');
  assert.doesNotMatch(CODE, /\b(?:Orb|ThinkingState|StreamingText|reasoningOrb)\b/, 'a retired AICSS piece is back');
  assert.match(CODE, /<ReasoningTrigger\b/);
  assert.doesNotMatch(CODE, /<\/ReasoningTrigger>/, 'the trigger must keep upstream\'s own Brain and chevron (no children)');
  assert.deepEqual(importedNames(CODE, '../ai-elements/shimmer'), ['Shimmer']);
  assert.match(CODE, /if \(isStreaming\) \{[\s\S]*?<Shimmer\b/, 'Shimmer belongs only to the active streaming state');
  assert.match(CODE, /Thought for \$\{time\}/, 'the settled line states the measured time');
});

test('current and recent activity contain only observed active or completed work', () => {
  //[[ RESTATED 2026-09-22 (A2). The selection moved out of thinking.tsx into execution-model.ts,
  //   where it is exercised against real reducer output in tests/thinking-surface.test.mjs (a
  //   recovered attempt is no row, an unknown step is no row, a real final failure is one row, the
  //   current row is the running one, recent is bounded). What stays here is the division of labour:
  //   the renderer never reads a step's state itself, so it cannot draw a state the model withheld. ]]
  assert.match(MODEL, /step\.state === 'active' \|\| step\.state === 'done' \|\| step === finalFailure/,
    'only active, done and the one real final failure may become rows');
  assert.match(MODEL, /run\.terminal\?\.kind === 'failed' && last\?\.state === 'failed'/,
    'a failure is final only when the run failed and it was the last thing the run did');
  assert.match(MODEL, /if \(steps\[index\]\?\.state === 'active'\)/,
    'the current row must come from an actually active step');
  assert.match(MODEL, /export const RECENT_ROWS = 2;/, 'recent activity must stay bounded');
  assert.doesNotMatch(CODE, /\.state === '(?:failed|unknown|active|done)'/,
    'thinking.tsx must not decide from a step\'s state; execution-model.ts does');
  assert.match(CODE, /executionView\(activity\)/, 'and it must draw what execution-model.ts decided');
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

test('PlaytestCard is part of the execution surface and receives the real run and frames', () => {
  //[[ RESTATED 2026-09-22 (A2): the details component is now ExecutionSurface, the body of the
  //   ReasoningContent. Same single owner, same props. ]]
  const details = sliceFunction(JSX, 'ExecutionSurface', 'thinkingMessage');
  assert.match(details, /\{playtest && \(/,
    'a playtest surface must exist only when the worker supplied a playtest run');
  assert.match(details, /<PlaytestCard run=\{playtest\} frames=\{frames \?\? \[\]\} studioConnected=\{studioConnected\} \/>/);
  assert.equal((CODE.match(/<PlaytestCard\b/g) ?? []).length, 1,
    'playtest must have one owner inside the reasoning details, not a second project-stage path');
  assert.doesNotMatch(CODE, /ProjectStage|gx-stage\b/,
    'the old separate project-stage path must stay absent');
});

test('honesty gates render observed facts only and failures stay with the turn outcome', () => {
  assert.match(JSX, /const passedGates = gates\.filter\(\(gate\) => gate\.passed\)/,
    'failed quality gates cause more work and must not be painted as completed reasoning milestones');
  assert.match(JSX, /const denied = deniedNote\(deniedTools\)/,
    'withheld tools may be explained only from the worker-supplied denied list');
  assert.match(JSX, /if \(!hasObservedContent\) return null;/,
    'an unobserved run must not receive placeholder reasoning UI');
  assert.match(JSX, /aria-label="Observed run activity"/);
  assert.match(JSX, /aria-label="Planned next actions"/);
  assert.match(JSX, /aria-label="Verified checks"/);
  assert.match(JSX, /role="note">\{denied\}<\/p>/);
  assert.match(JSX, /aria-live="polite">\{isLive \? title : ''\}<\/span>/,
    'live activity changes need a non-visual announcement path');

  assert.doesNotMatch(CODE, /<ActivityTerminal\b|<Failure\b|is-fail|is-bad/,
    'Thinking must stay calm and must not own terminal failure presentation');
  assert.match(TURN, /const outcome = outcomeLine\(item\.stopReason, item\.error\)/,
    'the turn outcome model must remain the source of terminal failure copy');
  assert.match(TURN, /className=\{`gx-outcome\$\{outcome\.tone === 'bad' \? ' is-bad' : ''\}`\}/,
    'terminal failures must remain in the answer-level outcome row');
});
