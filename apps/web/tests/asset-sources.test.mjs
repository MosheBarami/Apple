// Legacy source-policy pure helpers and the customer-facing send boundary.
//
// The owner asked for this dialog by name. The part worth testing is not that it renders: it is
// that it cannot be turned into a yes by the cheapest gesture available, and that a dismissed
// dialog does not leave behind something the rest of the product reads as an answer.
//
// RE-AIMED 2026-09-20, NOT WEAKENED. `apple_library` was removed from ASSET_SOURCE_CHOICES with
// the catalogue it authorised (packages/shared), and this file had been using it as its example of
// a VALID choice in eleven places — so every one of those assertions was pinning a vocabulary the
// product no longer has. Each question below is the question it was; only the member it is asked
// about moved to a live one. Two assertions were ADDED where the removal created a new way to be
// wrong: the retired member must now be refused by `cleanSelection`, and a stored policy that
// still names it must not survive into a pre-ticked box.
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
const WS = readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8');

/* ------------------------------------------------------------------ when to ask --- */

test('A DISMISSED DIALOG IS NOT AN ANSWER — the second way to be unanswered', () => {
  // `ask` is the obvious one. The one worth writing down is `remember` with an empty allow list:
  // that is what a dismissed dialog leaves behind, and treating it as settled means Apple builds
  // with no sources at all and nobody ever finds out why everything it makes is grey boxes.
  assert.equal(A.owesAnswer(null), true, 'never answered');
  assert.equal(A.owesAnswer(undefined), true);
  assert.equal(A.owesAnswer({ mode: 'ask', allow: [] }), true);
  assert.equal(A.owesAnswer({ mode: 'ask', allow: ['creator_store'] }), true, 'ask means ask, even with a list');
  assert.equal(A.owesAnswer({ mode: 'remember', allow: [] }), true, 'remembering nothing is not remembering');
  assert.equal(A.owesAnswer({ mode: 'remember', allow: ['creator_store'] }), false, 'this one is settled');
});

test('the dialog opens on the answer somebody already gave, not a blank form', () => {
  assert.deepEqual(A.initialSelection({ mode: 'remember', allow: ['creator_store'] }), ['creator_store']);
});

test('AND IT DOES NOT PRE-TICK THE ONE THAT SPENDS CREDITS', () => {
  // from_scratch builds geometry out of parts, which costs credits and time on every asset. A
  // default is not a decision, and this is the default that would cost money.
  const fresh = A.initialSelection(null);
  assert.equal(fresh.includes('from_scratch'), false, 'the paid choice must be opt-in');
  // It was two of these until the Apple library went; `creator_store` is what is left that adds
  // nothing to what a build already costs.
  assert.deepEqual(fresh, ['creator_store'], 'the one that costs nothing extra');
  // AND THE DEFAULT CANNOT NAME A RETIRED SOURCE. This is the failure that put this file in front
  // of somebody: a hand-written default outliving the vocabulary it was written against.
  for (const c of fresh) assert.ok(A.explainSource(c), `${c} is pre-ticked and is not a real choice`);
});

/* ---------------------------------------------------------------- what it says --- */

test('every choice states what it COSTS, not just what it is', () => {
  // "Creator Store" is a label. "Nothing to buy, and nothing uploaded — but the work is other
  // creators' and stays credited to them" is the thing somebody needs in order to choose.
  assert.equal(A.SOURCE_EXPLANATIONS.length, 2);
  for (const e of A.SOURCE_EXPLANATIONS) {
    assert.ok(e.title && e.title.length > 3, `${e.choice}: needs a name`);
    assert.ok(e.does && e.does.length > 30, `${e.choice}: must say what happens`);
    assert.ok(e.costs && e.costs.length > 10, `${e.choice}: must state the cost`);
    assert.ok(e.reach && e.reach.length > 25, `${e.choice}: explain availability and limits`);
  }
  const scratch = A.explainSource('from_scratch');
  assert.match(scratch.costs, /[Cc]redits/, 'the paid one must say it is paid');
});

test('source descriptions promise no inventory the product cannot prove', () => {
  // This test used to be asked about the Apple library — that a catalogue MATCH was not the same
  // as an insertable asset. The library is gone; the claim it was protecting against is not, and
  // `creator_store` is now the surface that can over-promise, because what it reaches depends on
  // Roblox permissions and on the individual asset rather than on us.
  const store = A.explainSource('creator_store');
  assert.match(store.reach, /permission|licence|license/i, 'what it can reach is not ours to guarantee');
  assert.match(store.costs, /[Cc]redits/, 'a free licence does not make the build free');
  assert.doesNotMatch(store.does, /already.*checked/i, 'harvested metadata is not an asset-quality review');
  for (const e of A.SOURCE_EXPLANATIONS) {
    assert.doesNotMatch(e.reach, /\d[\d,]* assets|Unlimited/i, 'static copy cannot prove live inventory or unlimited service');
  }
  // And a retired source has no card left to describe it.
  assert.equal(A.explainSource('apple_library'), null, 'the Apple library card must be gone, not merely unreachable');
});

test('an unrecognised choice never reaches the worker', () => {
  assert.deepEqual(A.cleanSelection(['from_scratch', 'nonsense', 'creator_store']), ['from_scratch', 'creator_store']);
  assert.deepEqual(A.cleanSelection(['creator_store', 'creator_store']), ['creator_store'], 'and a duplicate is dropped');
  assert.deepEqual(A.cleanSelection([]), []);
  // A RETIRED MEMBER IS AN UNRECOGNISED ONE. `apple_library` was a real choice until the catalogue
  // was removed; the worker now rejects a whole policy containing it, so anything this app sends
  // must not carry it.
  assert.deepEqual(A.cleanSelection(['apple_library', 'creator_store']), ['creator_store'],
    'the retired source must be stripped, not passed through');
});

/* ------------------------------------------------------------------ summarising --- */

test('the settings row reads as a sentence, and says when Apple will ask again', () => {
  assert.match(A.summarise({ mode: 'remember', allow: ['creator_store'] }).line, /Roblox Creator Store/);
  assert.match(A.summarise({ mode: 'remember', allow: ['creator_store', 'from_scratch'] }).line, /and/);
  assert.match(A.summarise({ mode: 'ask', allow: ['creator_store'] }).line, /ask again/);
  assert.equal(/ask again/.test(A.summarise({ mode: 'remember', allow: ['creator_store'] }).line), false);
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
  // `sending`, not `chosen`: the button is gated on what would actually be SAVED — the selection
  // after the ceiling has been applied. Gated on `chosen` it would enable itself for a tick that
  // the layers above strip out, which saves a policy allowing nothing and reopens this dialog on
  // the next send, forever.
  assert.match(DIALOG, /disabled=\{sending\.length === 0 \|\| save\.isPending\}/);
  assert.match(DIALOG, /Apple can only place plain parts/, 'the consequence, not "select an option"');
});

test('it is a real dialog for a screen reader', () => {
  assert.match(DIALOG, /role="dialog"/);
  assert.match(DIALOG, /aria-modal="true"/);
  assert.match(DIALOG, /aria-labelledby="asrc-title"/);
  assert.match(DIALOG, /role="alert"/, 'the refusal and the failure must be announced');
});

/* ------------------------------------------------------------------- the ceiling --- */
//
// `asset_sources` NARROWS through org, account and project (apps/worker/src/preferences.ts), so a
// project row can only ever REMOVE a source the layers above already allow. A dialog that ignored
// that would accept a tick its organisation forbids, resolve the intersection to nothing, and then
// — because nothing allowed is also the state that means "still owes an answer" — ask the same
// question again on the very next send, forever. The box has to be unavailable when it is offered.

test('NO CEILING MEANS NO LIMIT — the ordinary case leaves every live choice open', () => {
  // The default that matters most, because getting it backwards would grey out every box for every
  // project that ever existed. This is deliberately the OPPOSITE default from the worker's
  // `allowedSources`, which answers a different question — what a build may touch, where absent
  // must mean nothing.
  assert.deepEqual(A.availableChoices(null), ['creator_store', 'from_scratch']);
  assert.deepEqual(A.availableChoices(undefined), ['creator_store', 'from_scratch']);
  for (const c of ['creator_store', 'from_scratch']) {
    assert.equal(A.unavailableReason(null, c), null, `${c} must be pickable when nobody has restricted it`);
  }
});

test('A CEILING IS A LIMIT — what it does not allow cannot be ticked for one project', () => {
  const ceiling = { mode: 'remember', allow: ['creator_store'] };
  assert.deepEqual(A.availableChoices(ceiling), ['creator_store']);
  assert.equal(A.unavailableReason(ceiling, 'creator_store'), null);
  for (const c of ['from_scratch']) {
    const why = A.unavailableReason(ceiling, c);
    assert.ok(why, `${c} must be refused`);
    // It names WHERE the rule lives and that it is not this project's to change. A greyed box with
    // no sentence beside it reads as a bug in the product rather than as a rule.
    assert.match(why, /account or organisation/i, `${c}: the reason must say which layer decided`);
    assert.match(why, /project/i, `${c}: and that one project cannot override it`);
  }
});

test('a ceiling that allows nothing leaves nothing pickable — and says so rather than pretending', () => {
  assert.deepEqual(A.availableChoices({ mode: 'remember', allow: [] }), []);
  assert.match(DIALOG, /Every source is switched off for your account or organisation/,
    'with nothing to tick, "pick at least one" would be advice that cannot be taken');
});

test('a ceiling never invents a source that is not in the vocabulary', () => {
  // `apple_library` sits beside `toolbox` here deliberately: one was never a choice and one has
  // stopped being one, and a ceiling must treat them the same.
  assert.deepEqual(A.availableChoices({ mode: 'remember', allow: ['toolbox', 'apple_library', 'creator_store'] }), ['creator_store']);
});

test('THE PRE-TICKED SELECTION RESPECTS THE CEILING — a default must not be unsaveable', () => {
  // initialSelection pre-ticks the free choice. Under a ceiling that forbids it, a person who
  // touched nothing and pressed the button would be saving a selection the server strips — so the
  // default is filtered, not merely the checkbox.
  const ceiling = { mode: 'remember', allow: ['from_scratch'] };
  assert.deepEqual(A.initialSelection(null, ceiling), [], 'the free choice does not survive this ceiling');
  assert.deepEqual(
    A.initialSelection({ mode: 'remember', allow: ['creator_store', 'from_scratch'] }, ceiling),
    ['from_scratch'],
    'a stored answer is filtered too — the layers above may have changed since it was given',
  );
  // AND A STORED ANSWER THAT NAMES THE RETIRED SOURCE DOES NOT COME BACK AS A TICK, with no
  // ceiling in play at all. Rows written before 2026-09-20 still say `apple_library`.
  assert.deepEqual(
    A.initialSelection({ mode: 'remember', allow: ['apple_library', 'creator_store'] }),
    ['creator_store'],
    'a policy stored against the old vocabulary must not pre-tick a source no build can use',
  );
  // And with no ceiling the fresh default is unchanged, so this costs nothing in the ordinary case.
  assert.deepEqual(A.initialSelection(null), ['creator_store']);
});

test('the dialog disables what the ceiling forbids rather than letting it be swallowed', () => {
  assert.match(DIALOG, /unavailableReason\(ceiling, e\.choice\)/, 'each choice must ask about the ceiling');
  assert.match(DIALOG, /disabled=\{Boolean\(blocked\)\}/, 'and a forbidden choice must not be tickable');
  assert.match(DIALOG, /\{blocked && <span/, 'and it must say why on screen');
  // Belt and braces: the selection is filtered on the way out too, for a ceiling that changed
  // while the dialog sat open.
  assert.match(DIALOG, /cleanSelection\(chosen\)\.filter\(\(c\) => open\.includes\(c\)\)/);
});

/* --------------------------------------------------- customer-facing path is retired --- */

test('a customer send no longer waits for a source-selection dialog', () => {
  const send = WS.slice(WS.indexOf('const send = (text: string'), WS.indexOf('const lastAssistantId'));
  assert.ok(send.length > 80, 'send path was not found');
  assert.match(send, /sendChat\(text, mode, attachments, productModel, autonomous\)/);
  assert.doesNotMatch(send, /askFirst|setSourceAsk|AssetSourceDialog/);
});
