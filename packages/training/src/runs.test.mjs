// The training runs said what the backlog says they said.
//
// WHY THIS COULD NOT EXIST UNTIL NOW. Six backlog rows cited packages/training/runs/*.log and
// data/dataset-card.json as their only evidence, and both directories were gitignored — swept up
// by a rule written for adapters/, which is 210 MB of safetensors and correctly excluded. The logs
// are 36 KB of plain text. So six rows rested on files that lived on one laptop and could not be
// verified by a clone, a reviewer, or a later session on another machine.
//
// WHAT THIS PROVES, STATED NARROWLY: that the recorded run produced the numbers the backlog
// quotes, and that the v1 report's verdict is still the one in the file. It does NOT re-run the
// training — that needs an M2 Pro and no CI here can do it — and a green suite says nothing about
// whether the model is any good. v1 was a REGRESSION and was not promoted; these assertions are
// what stop that inconvenient fact being quietly lost.
//
// The assertions are about RELATIONSHIPS wherever one exists. "Validation loss was 1.294" is a
// number someone could paste anywhere. "Validation loss reached a minimum and then ROSE while
// training loss kept falling" is the shape of overfitting, it is the reason v2 stops at 120 iters,
// and it is the thing worth being unable to lose.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..', '..');

const log = (name) => readFileSync(join(ROOT, 'runs', name), 'utf8');

/**
 * Pull the loss series out of an MLX training log.
 *
 * The file interleaves tqdm progress bars with the lines that matter, and the bars carry `\r` and
 * box-drawing characters, so a naive line split sees one enormous line. Matching the two record
 * shapes directly is both simpler and stricter than trying to clean the file first.
 */
function series(text) {
  const val = [...text.matchAll(/Iter (\d+): Val loss ([\d.]+)/g)].map((m) => ({
    iter: Number(m[1]),
    loss: Number(m[2]),
  }));
  const train = [...text.matchAll(/Iter (\d+): Train loss ([\d.]+)/g)].map((m) => ({
    iter: Number(m[1]),
    loss: Number(m[2]),
  }));
  return { val, train };
}

const v1 = series(log('apple-v1.log'));

/* ----------------------------------------------------------------- the parser is honest --- */

test('the logs parse into a real series — nothing below is asserted against an empty array', () => {
  // The control. Every assertion here reads a series, and a regex that matched nothing would make
  // most of them vacuously true: `every()` on [] is true, and a `find` that returns undefined
  // would throw rather than pass, but the quiet ones are the risk.
  assert.ok(v1.val.length >= 3, `v1 has ${v1.val.length} validation points, expected several`);
  assert.ok(v1.train.length >= 10, `v1 has ${v1.train.length} training points, expected many`);
  for (const p of [...v1.val, ...v1.train]) {
    assert.ok(Number.isFinite(p.loss) && p.loss > 0, `a loss of ${p.loss} is not a measurement`);
    assert.ok(Number.isInteger(p.iter) && p.iter > 0, `iter ${p.iter} is not an iteration`);
  }
});

/* ------------------------------------------------- f-9abbb2b4 Validation loss, f-b7614c66 --- */

test('VALIDATION LOSS: the run starts at 2.812 and reaches 1.294, the figures the backlog quotes', () => {
  assert.equal(v1.val[0].loss, 2.812, 'the first validation point');
  const min = Math.min(...v1.val.map((p) => p.loss));
  assert.equal(min, 1.294, 'the minimum the report and the backlog both name');
});

test('AND IT ROSE AFTERWARDS — the overfitting shape, which is why v2 stops early', () => {
  // This is the assertion worth having. A minimum alone is a number. A minimum followed by a rise,
  // while training loss keeps falling, is the finding: the model began memorising 327 examples.
  const min = Math.min(...v1.val.map((p) => p.loss));
  const at = v1.val.find((p) => p.loss === min);
  const after = v1.val.filter((p) => p.iter > at.iter);
  assert.ok(after.length >= 1, 'validation must have been sampled after the minimum');
  assert.ok(
    after.some((p) => p.loss > min),
    'validation loss must RISE after its minimum, or the early-stop decision has no basis',
  );

  const trainBefore = v1.train.filter((p) => p.iter <= at.iter).at(-1);
  const trainAfter = v1.train.filter((p) => p.iter > at.iter).at(-1);
  if (trainBefore && trainAfter) {
    assert.ok(
      trainAfter.loss < trainBefore.loss,
      'training loss must keep FALLING while validation rises — the two together are overfitting',
    );
  }
});

test('the minimum is early in the run, which is what made 250 iterations the wrong number', () => {
  const min = Math.min(...v1.val.map((p) => p.loss));
  const at = v1.val.find((p) => p.loss === min);
  assert.ok(at.iter <= 60, `the minimum is at iter ${at.iter}; the run was configured for 250`);
});

/* ---------------------------------------------------- f-8aec72e9 SFT, f-9482f2cd the report --- */

test('THE REPORT STILL SAYS NOT PROMOTED — the fact a status of "done" hides', () => {
  const report = readFileSync(join(REPO, 'docs', 'audit', 'TRAINING-V1-REPORT.md'), 'utf8');

  // ANCHORED TO THE HEADLINE VERDICT, not to the phrase appearing anywhere.
  // My first version was `assert.match(report, /NOT PROMOTED/i)` and it did NOT go red when the
  // headline verdict was rewritten to "promoted" — because the document says "Still not promoted"
  // again at line 140, and a match over a 328-line file is satisfied by any occurrence. That is
  // docs/FAILURES.md F-59 exactly, committed by the person who wrote F-59 an hour earlier: an
  // assertion over a shared channel that a second event satisfies.
  const verdict = report.split('\n').find((l) => /^\*\*Verdict:/.test(l));
  assert.ok(verdict, 'the report must open with a bolded Verdict line');
  assert.match(verdict, /NOT PROMOTED/, 'the headline verdict itself must still say NOT PROMOTED');
  assert.match(verdict, /regression/i, 'and the reason must be in the verdict, not only later in prose');
  // The report is the only tracked artefact that carries the verdict. If it is ever trimmed to a
  // summary, this fails rather than the verdict quietly disappearing.
  assert.ok(report.split('\n').length > 100, 'the report must remain a report, not a stub');
});

test('the report quotes the same figures as the log, so neither can drift alone', () => {
  const report = readFileSync(join(REPO, 'docs', 'audit', 'TRAINING-V1-REPORT.md'), 'utf8');
  for (const n of ['2.812', '1.294']) {
    assert.ok(report.includes(n), `the report must still name ${n}`);
    assert.ok(
      v1.val.some((p) => String(p.loss) === n),
      `and the log must still contain ${n} — this is the cross-check, not two separate claims`,
    );
  }
});

/* --------------------------------------------------------- f-c6594b24 Model card generation --- */

test('THE DATASET CARD EXISTS AND RECORDS ITS OWN PROVENANCE', () => {
  const card = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset-card.json'), 'utf8'));
  assert.ok(Object.keys(card).length > 3, 'a card with nothing in it is not a card');
  const text = JSON.stringify(card);
  assert.match(text, /contamination/i, 'the card must record the contamination guard it was built under');
  assert.match(text, /shingle/i, 'and name the method, so the figure is reproducible');
});

test('the card describes the splits the build actually assigns', () => {
  // Cross-file again: the card is emitted by build-dataset.mjs, and assignSplits is separately
  // tested. If the card ever names a split the builder does not produce, one of them is lying.
  const card = JSON.parse(readFileSync(join(ROOT, 'data', 'dataset-card.json'), 'utf8'));
  const text = JSON.stringify(card).toLowerCase();
  for (const split of ['train', 'val', 'test']) {
    assert.ok(text.includes(split), `the card must account for the ${split} split`);
  }
});

/* ------------------------------------------------------------------- f-ef90bae2 holdout --- */

test('every run log is traceable to the base it trained against, via the config it names', () => {
  // The holdout row compares an adapter against its base, so "better than base" needs a named
  // subject. My first version of this asserted the log names the MODEL and it failed: the logs
  // record `Loading configuration file lora-apple-vN.yaml` and the base lives in that config.
  // That is a traceable chain rather than a gap, and asserting the chain is stronger than
  // asserting either end — it fails if a log stops naming its config OR if a config stops naming
  // a model, and it proves the two still refer to each other.
  for (const n of ['1', '2', '3']) {
    const text = log(`apple-v${n}.log`);
    const m = /Loading configuration file (lora-apple-v\d\.yaml)/.exec(text);
    assert.ok(m, `apple-v${n}.log must record which config it loaded`);
    assert.equal(m[1], `lora-apple-v${n}.yaml`, 'and it must be the matching one');
    const cfg = readFileSync(join(ROOT, m[1]), 'utf8');
    assert.match(cfg, /^model:\s*"[^"]+"/m, `${m[1]} must name the base model`);
  }
});
