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
/** Comments stripped. A rule that is GONE is often explained by a comment saying so, and a
 *  `doesNotMatch` over raw source would read that explanation as the rule coming back. */
const CSS_RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, '');

test('the activity card has one status-backed header and starts compact even while the run is live', () => {
  assert.equal((JSX.match(/aria-expanded=\{open\}/g) ?? []).length, 1,
    'the card must expose one disclosure header, not competing compact activity rows');
  assert.equal((JSX.match(/aria-controls=\{detailsId\}/g) ?? []).length, 1,
    'one disclosure control must own the activity details');
  assert.match(JSX, /const title = activity\.terminal\?\.note \?\?/);
  assert.match(JSX, /compact\.current/);
  assert.match(JSX, /status \?/);
  //[[ THIS USED TO READ `useState(false)` AND THE ASSERTION PINNED IT SHUT.
  //
  //   "Starts closed" was written as a layout fact and it is a product one: the card is the only
  //   place a person can see what is being done with their Credits WHILE it is being done, and
  //   every run on every screen opened with all of it folded away. What is pinned now is the
  //   three-state rule that replaced it — unstated, open, closed — because the bug the old
  //   assertion would have caught (a card that can no longer be collapsed) is still worth
  //   catching. A settled turn reloaded from history is not live and still rests closed. ]]
  assert.match(JSX, /const \[open, setOpen\] = useState\(false\)/,
    'a normal build must not auto-expand its internal activity timeline');
  assert.match(JSX, /onClick=\{\(\) => setOpen\(!open\)\}/, 'the toggle must still expose details on demand');
  assert.doesNotMatch(JSX, /openChoice \?\? isLive/);
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

  // RE-AIMED AT THE MECHANISM THAT RENDERS. These three lines used to read
  // `.gx-think.is-terminal .gx-think__compact-ring`, `.is-reduced`, `.is-page-hidden` — CSS
  // overrides for a compact preview row that the redesign deleted and that the FIRST test in this
  // file now forbids by class name. The suite was pinning rules for markup it also banned, which
  // is how seven dead selectors survived a stylesheet rewrite; it would have gone on passing if
  // the card had stopped animating entirely.
  //
  // The live mark is `.model-signature.is-live`, and the three conditions are enforced in the JSX
  // line above — the class is never applied at all when the card is terminal, reduced or hidden —
  // so what CSS still has to hold up is that the class means motion, and that the global
  // reduced-motion rule kills it for a user whose preference the hook never saw.
  assert.match(CSS, /\.model-signature\.is-live\s*\{[^{}]*animation:/,
    'the live identity mark has no animation, so `live` is a prop nothing renders');
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\) \{ \*,\*::before,\*::after \{ animation:none !important/,
    'the blanket reduced-motion stop is what covers this mark in CSS');
  assert.doesNotMatch(CSS_RULES, /gx-think__compact/,
    'the compact preview is forbidden in the markup (see above); its CSS may not come back either');
  assert.doesNotMatch(CSS_RULES, /scan-frame|banner-art|gx-think-scan/);
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

/* ===========================================================================================
 * THREE THINGS THE CARD EMITTED AND THE STYLESHEET DID NOT ANSWER.
 *
 * All three were MEASURED in Chromium against the real components and the real stylesheet, at
 * 900x1200, before the fixes below. What the browser reported:
 *
 *   Dc27ef7  .gx-think__chev  transform: none   — shut AND open. The only caret in the bundle
 *            that does not turn; four others do (layout.css:302, composer.css:134,
 *            project-stage.css:98). Now: matrix(-1, 0, 0, -1, 0, 0), i.e. rotate(180deg).
 *
 *   D38e22a  .gx-think__hint  ABSENT FROM THE DOM. `hint` was computed on every render and never
 *            reached the JSX, so the rule for it and the 375px rule hiding it were both dead, and
 *            so was headerHint()'s entire return value. Collapsed, the card was one line of text
 *            and an arrow that claimed nothing. Now: "View details", right-aligned before the
 *            chevron, display:none at 375px.
 *
 *   D2fc6f6  a failed step's glyph     rgb(189,186,182) — --muted, the SAME as the ✓ beside it
 *            a failed phase's pip      rgb(170,167,163) — --faint, the same as a finished phase
 *            "Stopped by an error"     rgb(189,186,182) — the same colour as "Finished"
 *            Now --bad: rgb(246,170,170) on dark at 9.94:1, rgb(163,49,49) on light at 6.62:1,
 *            both measured against the surface actually behind them.
 *
 * These read source, which is the bound this package has always had. The numbers above are the
 * evidence; what is pinned here is the rule whose absence produced them.
 * ======================================================================================== */

test('the card’s chevron turns when the card opens, like every other caret in the app', () => {
  assert.match(CSS_RULES, /\.gx-think__toggle\[aria-expanded='true'\]\s+\.gx-think__chev\s*\{[^{}]*transform:\s*rotate\(180deg\)/,
    'the chevron pointed the same way open and shut — measured transform:none in both states');
  assert.match(CSS_RULES, /\.gx-think__chev\s*\{[^{}]*transition:transform/,
    'it must travel, not teleport; the blanket reduced-motion rule removes the travel');
});

test('the collapsed header says that the arrow does something', () => {
  assert.match(JSX, /className="gx-think__hint"/,
    '`hint` was computed every render and rendered by nobody — .gx-think__hint had no element');
  assert.match(JSX, /const hint = /, 'and the value it renders has to be the computed one');
  // The reason it was worth leaving out, and the reason it is safe to put back.
  assert.match(JSX, /liveHint === title \? \(open \? 'Hide details' : 'View details'\) : liveHint/,
    'while live the hint and the title are the same string; printing it twice is not a second line');
  assert.match(CSS_RULES, /\.gx-think__hint\s*\{[^{}]*margin-inline-start:auto/,
    'the hint sits at the end of the header row, before the chevron');
});

test('a failed run does not look exactly like one that worked', () => {
  // The glyph, NOT the label: colouring `.gx-act__step.is-failed` outright would tint the step's
  // name and make the name look like the thing that is wrong. And not `.gx-tick` either — the ×
  // is a <path> carrying stroke="currentColor", which a stroke set on the parent <svg> loses to.
  assert.match(CSS_RULES, /\.gx-act__step\.is-failed\s+\.gx-act__mark\s*\{[^{}]*color:var\(--bad\)/,
    'a failed step’s × was --muted, the same ink as the ✓ next to it');
  assert.match(CSS_RULES, /\.gx-act__phase\.is-failed\s+\.gx-act__pip\s*\{[^{}]*background:var\(--bad\)/,
    'a failed phase’s pip was --faint, the same as a finished one');
  assert.match(CSS_RULES, /\.gx-term\.is-failed\s+\.gx-stage-row__name[^{}]*\{[^{}]*color:var\(--bad\)/,
    '"Stopped by an error" was drawn in exactly the colour of "Finished"');
  assert.match(CSS_RULES, /\.gx-term\.is-quota\s+\.gx-stage-row__name/,
    'running out of allowance is the other terminal where nothing came of the run');
  // The ones that must STAY neutral, each for a stated reason. `stopped` is the user's own Stop
  // button; `recovered` got there anyway; `incomplete` is the absence of an outcome, not a bad
  // one. Painting any of them red is a claim the wire never made.
  for (const kind of ['stopped', 'recovered', 'incomplete']) {
    assert.doesNotMatch(CSS_RULES, new RegExp(`\\.gx-term\\.is-${kind}[^{}]*\\{[^{}]*var\\(--bad\\)`),
      `${kind} is not a failure and must not be tinted as one`);
  }
});
