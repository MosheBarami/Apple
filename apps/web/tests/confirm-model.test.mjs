// How much friction an action has earned.
//
// This product had two habits that look opposite and are the same mistake — deciding the ceremony
// from how the code felt to write rather than from what the action costs the user:
//
//   * archiving a project, which is one UPDATE away from being undone, was about to get a
//     confirmation dialog. A dialog in front of a reversible action teaches people to dismiss
//     dialogs, which is exactly the training you do not want them to have arrived with when the
//     irreversible one appears.
//   * deleting a project — chat history, checkpoints and the Studio pairing, gone — was guarded by
//     a typed name, which is right, but the rule lived in one component and nothing said so.
//
// So the decision is a function, with the shape of the consequence as its only input, and the
// unknown-fact case is pinned: a consequence we cannot read must land on MORE friction, never less.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (f) => readFileSync(join(SRC, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { canConfirm, confirmationFor, confirmMatches } = await import('../src/lib/confirm-model.ts');

/* ----------------------------------------------------------- the ladder --- */

test('deleting something the user made, forever, asks them to type its name', () => {
  assert.equal(
    confirmationFor({ reversible: false, destroysUserContent: true }),
    'typed',
  );
});

test('an irreversible action that destroys nothing still stops for a dialog', () => {
  assert.equal(confirmationFor({ reversible: false, destroysUserContent: false }), 'dialog');
});

test('A REVERSIBLE ACTION IS NEVER GUARDED BY A DIALOG', () => {
  // The rule this file exists for. Archiving destroys nothing permanently, so the user finds out
  // by doing it and takes it back if they were wrong.
  assert.equal(confirmationFor({ reversible: true, destroysUserContent: true }), 'undo');
  assert.equal(confirmationFor({ reversible: true, destroysUserContent: false }), 'none');
});

test('spending money stops even when it can be taken back', () => {
  assert.equal(
    confirmationFor({ reversible: true, destroysUserContent: false, costsMoney: true }),
    'dialog',
  );
});

test('A CONSEQUENCE WE CANNOT READ IS TREATED AS THE WORSE ONE', () => {
  // The violating inputs, fed on purpose. `reversible: 'yes'` is truthy, and a truthy read would
  // downgrade a permanent delete to an undo toast — friction removed by a type error.
  for (const bad of ['yes', 'false', 1, 0, null, undefined, {}]) {
    assert.equal(
      confirmationFor({ reversible: bad, destroysUserContent: true }),
      'typed',
      `reversible: ${JSON.stringify(bad)} was read as reversible`,
    );
  }
  // And the same on the other axis: an unreadable "destroys" must not soften an irreversible act.
  for (const bad of ['no', 0, null, undefined]) {
    assert.equal(
      confirmationFor({ reversible: false, destroysUserContent: bad }),
      'dialog',
      `destroysUserContent: ${JSON.stringify(bad)} produced less than a dialog`,
    );
  }
});

/* ------------------------------------------------------- typing the name --- */

test('the typed name must be the name', () => {
  assert.equal(confirmMatches('Sword Fight', 'Sword Fight'), true);
  assert.equal(confirmMatches(' Sword Fight ', 'Sword Fight'), true, 'stray whitespace is not a mistake');
  assert.equal(confirmMatches('sword fight', 'Sword Fight'), false, 'case is part of the name');
  assert.equal(confirmMatches('Sword Figh', 'Sword Fight'), false);
  assert.equal(confirmMatches('Sword Fight 2', 'Sword Fight'), false);
});

test('AN EMPTY EXPECTED NAME CONFIRMS NOTHING', () => {
  // The fail-open case, fed directly. A project whose name is empty — or whitespace, which several
  // of them are — turned an empty box into a confirmed permanent delete: the button was live
  // before the dialog had finished rendering.
  for (const expected of ['', '   ', '\n', null, undefined, 123]) {
    for (const typed of ['', '   ', 'anything']) {
      assert.equal(
        confirmMatches(typed, expected),
        false,
        `typed ${JSON.stringify(typed)} confirmed an expected of ${JSON.stringify(expected)}`,
      );
    }
  }
});

test('a name typed with a different Unicode spelling of the same letters matches', () => {
  // "Café" composed vs decomposed: identical on screen, different bytes. Refusing this is asking
  // the user to fix their keyboard before they can delete their own project.
  const composed = 'Café Tycoon';
  const decomposed = 'Café Tycoon';
  assert.notEqual(composed, decomposed, 'the two spellings must really differ, or this proves nothing');
  assert.equal(confirmMatches(decomposed, composed), true);
  assert.equal(confirmMatches(composed, decomposed), true);
});

test('a non-string typed value never matches', () => {
  for (const bad of [null, undefined, 0, {}, ['Sword Fight']]) {
    assert.equal(confirmMatches(bad, 'Sword Fight'), false, `${JSON.stringify(bad)} matched`);
  }
});

/* ------------------------------------------------- may the button act yet --- */

test('a dialog is confirmed by pressing the button', () => {
  assert.equal(canConfirm({ ceremony: 'dialog' }), true);
});

test('a typed confirmation is confirmed only by the name', () => {
  assert.equal(canConfirm({ ceremony: 'typed', typed: 'Sword Fight', subject: 'Sword Fight' }), true);
  assert.equal(canConfirm({ ceremony: 'typed', typed: 'sword fight', subject: 'Sword Fight' }), false);
  assert.equal(canConfirm({ ceremony: 'typed', typed: '', subject: 'Sword Fight' }), false);
});

test('A TYPED CONFIRMATION WITH NOTHING TO TYPE NEVER FALLS BACK TO A PLAIN OK', () => {
  // The violating input: the dialog demands a name, and the subject has none. Falling back to
  // "well, they pressed the button" is the fail-open that makes the ceremony decorative.
  for (const subject of [undefined, null, '', '   ', 42]) {
    assert.equal(
      canConfirm({ ceremony: 'typed', typed: 'anything', subject }),
      false,
      `a subject of ${JSON.stringify(subject)} was confirmable`,
    );
  }
});

test('A DIALOG THAT DOES NOT KNOW WHY IT IS ASKING DOES NOT ACT', () => {
  // 'none' and 'undo' mean no dialog should have been rendered at all. If one was, the bug is at
  // the call site, and a confirm button that works anyway is how that bug reaches a user.
  for (const ceremony of ['none', 'undo', '', undefined, null, 'DIALOG', 7]) {
    assert.equal(
      canConfirm({ ceremony, typed: 'x', subject: 'x' }),
      false,
      `a ceremony of ${JSON.stringify(ceremony)} let the button act`,
    );
  }
});

/* ------------------------------------------------------------ the wiring --- */

test('the delete dialog no longer compares the strings itself', () => {
  const dash = code(read('routes/dashboard.tsx'));
  // The old comparison is the one that let an empty name through, and it is the reason the rule
  // now lives in one place instead of in whichever component happened to need it.
  assert.doesNotMatch(dash, /typed === project\.name/, 'the hand-rolled comparison is gone');
  assert.doesNotMatch(dash, /confirm-project-name/, 'and so is its hand-rolled field');
});

test('the permanent delete declares itself permanent to the model', () => {
  const dash = code(read('routes/dashboard.tsx'));
  assert.match(
    dash,
    /confirmationFor\(\{ reversible: false, destroysUserContent: true \}\)/,
    'the dialog must state the consequence it is guarding',
  );
});

test('the shared dialog asks the model whether its button may act', () => {
  const dialog = code(read('components/confirm-dialog.tsx'));
  assert.match(dialog, /canConfirm\(\{ ceremony, typed, subject \}\)/, 'readiness belongs to the model');
  // Built on the existing Modal — focus trap, Escape, restore — rather than a second dialog.
  assert.match(dialog, /import \{ Modal \} from '\.\/modal'/);
  // The lock exists so a dialog cannot be dismissed out from under a mutation that is in flight.
  assert.match(dialog, /locked=\{busy\}/);
});

test('and the destructive delete is that dialog, not a hand-rolled one', () => {
  const dash = code(read('routes/dashboard.tsx'));
  assert.match(dash, /<ConfirmDialog/);
  assert.match(dash, /ceremony=\{ceremony\}/, 'the verdict from the model is what shapes the dialog');
});
