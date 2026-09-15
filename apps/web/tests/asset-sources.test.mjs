// Where Apple may get assets from — asked once, and the asking has to be real.
//
// The owner asked for this dialog by name. The part worth testing is not that it renders: it is
// that it cannot be turned into a yes by the cheapest gesture available, and that a dismissed
// dialog does not leave behind something the rest of the product reads as an answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'asrc-')), 'a.mjs');
// esbuild lives in the worker's node_modules, not the web app's — the same path every other web
// test that bundles TypeScript uses.
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'asset-sources.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
  { cwd: WEB, stdio: 'pipe' });
const A = await import(`file://${out}`);

const DIALOG = readFileSync(join(WEB, 'src', 'components', 'asset-source-dialog.tsx'), 'utf8');

/* ------------------------------------------------------------------ when to ask --- */

test('A DISMISSED DIALOG IS NOT AN ANSWER — the second way to be unanswered', () => {
  // `ask` is the obvious one. The one worth writing down is `remember` with an empty allow list:
  // that is what a dismissed dialog leaves behind, and treating it as settled means Apple builds
  // with no sources at all and nobody ever finds out why everything it makes is grey boxes.
  assert.equal(A.owesAnswer(null), true, 'never answered');
  assert.equal(A.owesAnswer(undefined), true);
  assert.equal(A.owesAnswer({ mode: 'ask', allow: [] }), true);
  assert.equal(A.owesAnswer({ mode: 'ask', allow: ['apple_library'] }), true, 'ask means ask, even with a list');
  assert.equal(A.owesAnswer({ mode: 'remember', allow: [] }), true, 'remembering nothing is not remembering');
  assert.equal(A.owesAnswer({ mode: 'remember', allow: ['apple_library'] }), false, 'this one is settled');
});

test('the dialog opens on the answer somebody already gave, not a blank form', () => {
  assert.deepEqual(A.initialSelection({ mode: 'remember', allow: ['creator_store'] }), ['creator_store']);
});

test('AND IT DOES NOT PRE-TICK THE ONE THAT SPENDS CREDITS', () => {
  // from_scratch builds geometry out of parts, which costs credits and time on every asset. A
  // default is not a decision, and this is the default that would cost money.
  const fresh = A.initialSelection(null);
  assert.equal(fresh.includes('from_scratch'), false, 'the paid choice must be opt-in');
  assert.deepEqual(fresh, ['apple_library', 'creator_store'], 'the two that cost nothing');
});

/* ---------------------------------------------------------------- what it says --- */

test('every choice states what it COSTS, not just what it is', () => {
  // "Creator Store" is a label. "Nothing to buy, and nothing uploaded — but the work is other
  // creators' and stays credited to them" is the thing somebody needs in order to choose.
  assert.equal(A.SOURCE_EXPLANATIONS.length, 3);
  for (const e of A.SOURCE_EXPLANATIONS) {
    assert.ok(e.title && e.title.length > 3, `${e.choice}: needs a name`);
    assert.ok(e.does && e.does.length > 30, `${e.choice}: must say what happens`);
    assert.ok(e.costs && e.costs.length > 10, `${e.choice}: must state the cost`);
    assert.ok(e.reach && /\d|Unlimited/.test(e.reach), `${e.choice}: reach must be a figure, not an impression`);
  }
  const scratch = A.explainSource('from_scratch');
  assert.match(scratch.costs, /[Cc]redits/, 'the paid one must say it is paid');
});

test('an unrecognised choice never reaches the worker', () => {
  assert.deepEqual(A.cleanSelection(['apple_library', 'nonsense', 'creator_store']), ['apple_library', 'creator_store']);
  assert.deepEqual(A.cleanSelection(['apple_library', 'apple_library']), ['apple_library'], 'and a duplicate is dropped');
  assert.deepEqual(A.cleanSelection([]), []);
});

/* ------------------------------------------------------------------ summarising --- */

test('the settings row reads as a sentence, and says when Apple will ask again', () => {
  assert.match(A.summarise({ mode: 'remember', allow: ['apple_library'] }).line, /Apple library/);
  assert.match(A.summarise({ mode: 'remember', allow: ['apple_library', 'creator_store'] }).line, /and/);
  assert.match(A.summarise({ mode: 'ask', allow: ['apple_library'] }).line, /ask again/);
  assert.equal(/ask again/.test(A.summarise({ mode: 'remember', allow: ['apple_library'] }).line), false);
});

test('NO SOURCES IS ITS OWN STATE, not an empty sentence', () => {
  const s = A.summarise({ mode: 'remember', allow: [] });
  assert.equal(s.empty, true);
  assert.match(s.line, /no asset sources/);
  assert.match(s.line, /ask/, 'and it must say what happens next');
});

/* --------------------------------------------------------------- the dialog itself --- */

test('THE CHEAPEST GESTURE MUST NOT BE THE ONE THAT SAYS YES', () => {
  // A scrim that dismisses on click, or an X in the corner, turns "I did not read this" into
  // permission. Escape and "Not yet" both reach onCancel, which leaves the policy untouched — so
  // the build does not start.
  assert.equal(/onClick=\{onCancel\}[\s\S]{0,80}scrim/.test(DIALOG), false, 'the scrim must not cancel on click');
  assert.match(DIALOG, /if \(e\.key === 'Escape'\) onCancel\(\)/, 'escape must cancel, not confirm');
  assert.match(DIALOG, /onClick=\{onCancel\}/, 'and there must be a visible way out');
  assert.equal(/aria-label="Close"/.test(DIALOG), false, 'no bare X — a close button reads as neutral and is not');
});

test('the build waits for the answer to be STORED, not for the click', () => {
  // onDone fires from the mutation's success, so a save that failed cannot start a build under a
  // policy nobody recorded.
  assert.match(DIALOG, /onSuccess: \(\) => onDone\(\)/);
  assert.match(DIALOG, /save\.isError/, 'and a failed save must say so rather than closing');
});

test('nothing chosen cannot be submitted, and the reason is on screen', () => {
  assert.match(DIALOG, /disabled=\{chosen\.length === 0 \|\| save\.isPending\}/);
  assert.match(DIALOG, /Apple can only place plain parts/, 'the consequence, not "select an option"');
});

test('it is a real dialog for a screen reader', () => {
  assert.match(DIALOG, /role="dialog"/);
  assert.match(DIALOG, /aria-modal="true"/);
  assert.match(DIALOG, /aria-labelledby="asrc-title"/);
  assert.match(DIALOG, /role="alert"/, 'the refusal and the failure must be announced');
});
