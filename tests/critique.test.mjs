// The harsh critique protocol (scripts/eval/lib/critique.mjs): a critique that skips a crop, ignores a measured
// defect, scores past a cap or picks its own verdict is refused; a complete, honest one is accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, SIGNATURES, checkCritique, defectKey, gridCells, measuredDefects, verdictOf } from '../scripts/eval/lib/critique.mjs';
import { layoutGate } from '../scripts/eval/lib/style-gates.mjs';

const manifest = {
  run: { stopReason: 'timeout' },
  playTest: { errors: 3 },
  layoutLint: [{ file: 'shots/ui.jpg', findings: [{ rule: 'same-icon', path: 'StarterGui.Shop.Grid', detail: '5 of 5 cards show the same picture in the same tint' }] }],
};
const defects = measuredDefects(manifest);
const expected = {
  images: [{ file: 'shots/ui.jpg', sha256: 'abc' }],
  crops: [{ id: 'ui.panel', path: 'x/ui.panel.png' }, { id: 'ui.r1c1', path: 'x/ui.r1c1.png' }],
  defects,
};
const long = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
function honest() {
  return {
    images: [{ file: 'shots/ui.jpg', sha256: 'abc' }],
    crops: [
      { id: 'ui.panel', seen: long(14), defects: ['every egg is the same yellow picture'] },
      { id: 'ui.r1c1', seen: long(12), defects: [] },
    ],
    measured: defects.map((d) => ({ key: defectKey(d), verdict: 'real', fix: 'tint each egg by its rarity token' })),
    scores: Object.fromEntries(AREAS.map((a) => [a, { score: 4, defects: [`${a} defect one is here`, `${a} defect two is here`] }])),
    signatures: Object.fromEntries(SIGNATURES.map((s) => [s.split(' ')[0], 'weak'])),
    worst: 'six identical yellow eggs make the shop unreadable at a glance',
    fixes: [1, 2, 3].map(() => ({ file: 'apps/worker/src/studkit.ts', change: 'give each list item its own icon tint' })),
    verdict: 'fail',
  };
}

test('the measured defects come from the lints, the play test, a timeout and the colour gate', () => {
  assert.deepEqual(defects.map((d) => d.rule).sort(), ['play-error', 'same-icon', 'timeout']);
  assert.equal(measuredDefects({ gates: { colour: { pass: false, reasons: ['grey'] } } })[0].rule, 'colour-gate');
});

test('a complete, honest critique is accepted', () => {
  assert.deepEqual(checkCritique(honest(), expected), []);
});

test('THE CONTROL: the empty skeleton is refused, crop by crop and area by area', () => {
  const errs = checkCritique({}, expected);
  assert.ok(errs.some((e) => /crop ui.panel has no entry/.test(e)));
  assert.ok(errs.some((e) => /score for delivers missing/.test(e)));
  assert.ok(errs.some((e) => /measured defect not answered: \[same-icon\]/.test(e)));
});

test('a skipped crop is refused', () => {
  const c = honest();
  c.crops.pop();
  assert.ok(checkCritique(c, expected).some((e) => /crop ui.r1c1 has no entry/.test(e)));
});

test('a score above a measured cap is refused, and a false positive with a reason lifts the cap', () => {
  const c = honest();
  c.scores.visual = { score: 7, defects: ['one real defect named here', 'two real defects named here'] };
  assert.ok(checkCritique(c, expected).some((e) => /visual scored 7, but a measured defect caps it at 5/.test(e)));
  const i = c.measured.findIndex((m) => m.key.startsWith('same-icon'));
  c.measured[i] = { key: c.measured[i].key, verdict: 'false-positive', reason: 'the five cards are deliberately one product in five sizes' };
  assert.ok(!checkCritique(c, expected).some((e) => /visual scored/.test(e)));
});

test('a low score must name its defects, a high one must say why', () => {
  const c = honest();
  c.scores.layout = { score: 5, defects: ['only one'] };
  c.scores.style = { score: 9, defects: [], why: 'short' };
  const errs = checkCritique(c, expected);
  assert.ok(errs.some((e) => /layout scored 5: name at least 2/.test(e)));
  assert.ok(errs.some((e) => /style scored 9: say why/.test(e)));
});

test('the verdict is computed: a chosen "pass" over a real defect is refused', () => {
  const c = honest();
  c.verdict = 'pass';
  assert.ok(checkCritique(c, expected).some((e) => /verdict must be "fail"/.test(e)));
  const high = Object.fromEntries(AREAS.map((a) => [a, { score: 8 }]));
  const sig = Object.fromEntries(SIGNATURES.map((s) => [s.split(' ')[0], 'present']));
  assert.equal(verdictOf(high, sig, [], []), 'pass');
  assert.equal(verdictOf(high, { ...sig, 3: 'missing' }, [], []), 'fail');
});

test('a changed picture invalidates the critique, and a fix must name a real file', () => {
  const c = honest();
  c.images[0].sha256 = 'old';
  c.fixes[0].file = 'no/such/file.ts';
  const errs = checkCritique(c, expected, (p) => p !== 'no/such/file.ts');
  assert.ok(errs.some((e) => /changed since the critique/.test(e)));
  assert.ok(errs.some((e) => /does not exist: no\/such\/file.ts/.test(e)));
});

test('the layout gate fails on any finding or an unmeasured panel, and passes when nothing was shown', () => {
  assert.equal(layoutGate(manifest.layoutLint).pass, false);
  assert.equal(layoutGate([{ file: 'a', error: 'timeout' }]).pass, false);
  assert.equal(layoutGate([{ file: 'a', findings: [] }]).pass, true);
  assert.equal(layoutGate(undefined).pass, true);
});

test('the grid covers the whole picture in nine cells', () => {
  const cells = gridCells(1174, 623);
  assert.equal(cells.length, 9);
  assert.equal(cells.reduce((n, c) => n + c.box[2] * c.box[3], 0), 1174 * 623);
});
