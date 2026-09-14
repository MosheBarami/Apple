// Running a failed prompt again.
//
// Before this, a run that errored or finished without doing anything left the user retyping their
// prompt — the single most common thing to need after a failure, and the one the product made
// hardest. Stop already existed in the composer; retry did not exist anywhere.
//
// Two decisions carry the risk, and both are about scope:
//
//   * retry reuses `edit_resend` rather than adding a second re-run path, so there is one
//     definition of what running again means;
//   * it is offered ONLY on the last turn, which is what makes it safe to run without confirming.
//     Retrying an older failure would discard everything after it — that is the edit path, and it
//     asks first for exactly that reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, '..');
const TURN = readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8');
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');
const COMPOSER = readFileSync(join(WEB, 'src', 'components', 'ws', 'composer.tsx'), 'utf8');

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// -------------------------------------------------------------------- stop ---

test('stop is reachable from the workspace, not only from the plugin', () => {
  assert.match(COMPOSER, /aria-label="Stop this run"/);
  assert.match(WS, /onStop=\{stop\}/);
});

// ------------------------------------------------------------------- retry ---

test('a failed run offers to run again', () => {
  assert.match(TURN, /Try again/);
  assert.match(TURN, /onClick=\{onRetry\}/);
});

test('retry is offered only when the run did not succeed', () => {
  // `outcome` is undefined for a clean run, and the button lives inside that block — a "Try again"
  // under a successful run invites the user to spend a Spark undoing work that went fine.
  const block = TURN.slice(TURN.indexOf('{outcome && ('), TURN.indexOf('<Stamp at={item.createdAt} align="start"'));
  assert.match(block, /Try again/);
  assert.match(TURN, /const outcome = item\.stopReason && item\.stopReason !== 'done'/);
});

test('a quota stop offers no retry', () => {
  // The run did not fail; the account ran out. A button that re-runs into the same wall teaches
  // the user the product is broken rather than that they are out of Sparks.
  assert.match(TURN, /item\.stopReason !== 'quota'/);
});

test('retry is offered only on the last turn', () => {
  // Retrying an older turn would silently discard everything after it. That is the edit path, and
  // it asks first.
  assert.match(WS, /onRetry=\{item\.id === lastAssistantId && !running \? retryLast : undefined\}/);
});

test('retry is absent while something is running', () => {
  assert.match(WS, /&& !running \? retryLast : undefined/);
  const fn = WS.slice(WS.indexOf('const retryLast'), WS.indexOf('const [editing'));
  assert.match(fn, /if \(running\) return;/, 'and guarded again in the handler, not only in the render');
});

// ------------------------------------------------------------ what it reuses ---

test('retry goes through edit_resend rather than a second re-run path', () => {
  // The server behaviour a retry needs — drop the failed turn, run the prompt again — is exactly
  // what an edit does. A second endpoint would be a second definition of re-running.
  const fn = WS.slice(WS.indexOf('const retryLast'), WS.indexOf('const [editing'));
  assert.match(fn, /editAndResend\(lastUser\.id, lastUser\.content, PRODUCT_MODE_TO_SPECIALIST\[mode\]\)/);
});

test('it resends the last USER message, not the failed assistant turn', () => {
  // Resending the assistant turn's id is refused by the server, so getting this wrong produces a
  // button that silently does nothing.
  const fn = WS.slice(WS.indexOf('const retryLast'), WS.indexOf('const [editing'));
  assert.match(fn, /\[\.\.\.messages\]\.reverse\(\)\.find\(\(m\) => m\.role === 'user'\)/);
});

test('it does nothing rather than throwing when there is no prompt to retry', () => {
  const fn = WS.slice(WS.indexOf('const retryLast'), WS.indexOf('const [editing'));
  assert.match(fn, /if \(!lastUser\) return;/);
});

test('the text is sent unchanged — a retry is not an edit', () => {
  const fn = stripComments(WS.slice(WS.indexOf('const retryLast'), WS.indexOf('const [editing')));
  assert.match(fn, /lastUser\.content/);
  assert.equal(/\.trim\(\)|prompt\(|setEditing/.test(fn), false, 'retry must not alter or re-ask for the text');
});

test('the mode is translated the same way the composer translates it', () => {
  // Sending the product mode raw puts "plan" on a wire that expects a specialist.
  const fn = WS.slice(WS.indexOf('const retryLast'), WS.indexOf('const [editing'));
  assert.match(fn, /PRODUCT_MODE_TO_SPECIALIST\[mode\]/);
});

// ----------------------------------------------------------------- the shape ---

test('the outcome line is a row, so the control sits with the sentence', () => {
  // It reads as a continuation of "Something went wrong partway through", not as a call to action
  // parked underneath it.
  assert.match(TURN, /<div className=\{`gx-outcome\$\{/);
  assert.match(TURN, /className="gx-outcome__text"/);
  const CSS = readFileSync(join(WEB, 'src', 'styles', 'workspace.css'), 'utf8');
  const rule = CSS.slice(CSS.indexOf('.gx-outcome {'));
  assert.match(rule, /align-items: baseline/);
});

test('the retry control has a visible focus state', () => {
  const CSS = readFileSync(join(WEB, 'src', 'styles', 'workspace.css'), 'utf8');
  assert.match(CSS, /\.gx-outcome__retry:focus-visible/);
});
