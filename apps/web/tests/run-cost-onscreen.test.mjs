//[[ WHAT A RUN IS COSTING, WHILE IT RUNS, ON SCREEN.
//
// B9 of docs/spec/DONE.md: "Every run shows what it cost in credits, while it runs."
//
// `tests/run-meters.test.mjs` already pins that the figure exists, is the worker's settled one,
// and is never a confident zero. It could not pin the thing that was actually wrong, because the
// defect was not in the text: the figure was inside `.gx-think__body`, which `system.css` leaves
// `display:none` until the panel is opened. An audit of the deployed product read it with
// `innerText` and recorded it as visible — `innerText` falls back to `textContent` on an element
// that is not rendered, so a failure to observe rendered as an observation.
//
// THIS FILE ASSERTS PLACEMENT, NOT PROSE. The head is the always-drawn half of the card; the body
// is the half behind the toggle. Which half the figure is in is the whole claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
const JSX = src('components/ws/thinking.tsx');
const SYSTEM = src('design/system.css');
const THINKING_CSS = src('components/ws/thinking.css');

/** The markup between the head's opening tag and the body's — i.e. what is drawn when closed. */
function halves() {
  const head = JSX.indexOf('className="gx-think__head"');
  const body = JSX.indexOf('gx-think__body${open');
  assert.notEqual(head, -1, 'the card has lost its head');
  assert.notEqual(body, -1, 'the card has lost its collapsible body');
  assert.ok(head < body, 'the head must come before the body');
  return { head: JSX.slice(head, body), body: JSX.slice(body) };
}

test('THE PREMISE: the body really is hidden until the person opens it', () => {
  // Without this the rest of the file is asserting a distinction that does not exist. Matched on
  // the declaration rather than the whole rule, because the rule is written on one shared line.
  assert.match(SYSTEM, /\.gx-think__body \{ display:none; \}/);
  assert.match(SYSTEM, /\.gx-think__body\.is-open \{ display:block;/);
});

test('the live cost is in the head, so no click stands between a person and the price', () => {
  const { head, body } = halves();
  assert.match(head, /className="gx-think__cost"/, 'the cost figure is not in the always-drawn head');
  assert.doesNotMatch(body, /gx-think__cost/, 'the cost figure is back inside the collapsed panel');
});

test('and it is still the worker\'s figure, still never a zero', () => {
  const { head } = halves();
  assert.match(head, /status\?\.creditsSpent != null && status\.creditsSpent > 0/);
  assert.match(head, /status\.creditsSpent === 1 \? 'Credit' : 'Credits'/);
});

test('it is said once, not twice', () => {
  // It used to live in the foot. Printing one measurement in both halves of the card invites the
  // reader to add them up.
  assert.equal((JSX.match(/creditsSpent/g) ?? []).length > 0, true);
  const { body } = halves();
  assert.doesNotMatch(body, /creditsSpent/, 'the foot is restating the run cost');
});

test('the phone keeps it — unlike the affordance beside it', () => {
  //[[ `.gx-think__hint` is display:none under 420px, and that is right: the chevron already says
  //   the panel opens. The cost is not an affordance, and a phone is where somebody can least
  //   afford to learn the price afterwards. This guards against it being swept into the same
  //   narrow-screen rule by someone tidying the header. ]]
  const narrow = SYSTEM.slice(SYSTEM.indexOf('@media (max-width:'));
  assert.doesNotMatch(narrow, /gx-think__cost[^{]*\{[^}]*display:none/);
  assert.doesNotMatch(THINKING_CSS.replace(/\/\*[\s\S]*?\*\//g, ''), /gx-think__cost[^{]*\{[^}]*display:none/);
});
